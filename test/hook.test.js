import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const HOOK = path.join(ROOT, "dist", "hook.js");

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "memory-hook-test-"));
}

async function writeFakeIngest(dir) {
  const fake = path.join(dir, "fake-ingest.mjs");
  await fs.writeFile(
    fake,
    [
      "import fs from 'node:fs';",
      "const filePath = process.argv[2];",
      "const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));",
      "fs.appendFileSync(process.env.CAPTURE_FILE, JSON.stringify({ filePath, payload }) + '\\n');"
    ].join("\n"),
    "utf8"
  );
  return fake;
}

async function runHook(eventName, input, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK, eventName], {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`hook exited with ${code}: ${stderr}`));
        return;
      }
      resolve();
    });

    child.stdin.end(JSON.stringify(input));
  });
}

async function readCapture(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function makeEnv() {
  const dir = await makeTempDir();
  const stateDir = path.join(dir, "state");
  const capture = path.join(dir, "capture.jsonl");
  const fake = await writeFakeIngest(dir);
  return {
    dir,
    stateDir,
    capture,
    env: {
      CAPTURE_FILE: capture,
      MEMORY_HOOK_STATE_DIR: stateDir,
      MEMORY_HOOK_INGEST_CMD: `"${process.execPath}" "${fake}"`
    }
  };
}

async function readTrace(stateDir) {
  const raw = await fs.readFile(path.join(stateDir, "trace.jsonl"), "utf8");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readIngestedJson(capture) {
  const calls = await readCapture(capture);
  for (const call of calls) {
    assert.match(call.filePath, /\.json$/);
  }
  return calls.map((call) => call.payload);
}

test("agentStop ingests only a simple chronological list", async () => {
  const { capture, env } = await makeEnv();
  await runHook(
    "userPromptSubmitted",
    {
      timestamp: 1704614500000,
      cwd: ROOT,
      prompt: "Use the build-commit-pr skill."
    },
    env
  );
  await runHook(
    "postToolUse",
    {
      timestamp: 1704614610000,
      cwd: ROOT,
      toolName: "ask_user",
      toolArgs: { message: "Which base branch should I use?" },
      toolResult: {
        resultType: "success",
        textResultForLlm: "main"
      }
    },
    env
  );
  await runHook(
    "postToolUse",
    {
      timestamp: 1704614710000,
      cwd: ROOT,
      toolName: "bash",
      toolArgs: JSON.stringify({ command: "npm test" }),
      toolResult: {
        resultType: "success",
        textResultForLlm: "All tests passed (15/15)"
      }
    },
    env
  );
  await runHook(
    "agentStop",
    {
      timestamp: 1704617900000,
      cwd: ROOT,
      reason: "completed"
    },
    env
  );

  const payloads = await readIngestedJson(capture);
  assert.deepEqual(payloads, [[
    { time: 1704614500000, type: "user_prompt", content: "Use the build-commit-pr skill." },
    { time: 1704614610000, type: "ask_user", content: "Which base branch should I use?" },
    { time: 1704614610000, type: "user_responed", content: "main" }
  ]]);
});

test("a duplicate postToolUse item is written only once", async () => {
  const { capture, env } = await makeEnv();
  const postTool = {
    timestamp: 1704614610000,
    cwd: ROOT,
    toolName: "ask_user",
    toolArgs: JSON.stringify({ message: "Proceed?" }),
    toolResult: {
      resultType: "success",
      textResultForLlm: "yes"
    }
  };

  await runHook("postToolUse", postTool, env);
  await runHook("postToolUse", postTool, env);
  await runHook("agentStop", { timestamp: 1704617900000, cwd: ROOT }, env);

  const payloads = await readIngestedJson(capture);
  assert.deepEqual(payloads, [[
    { time: 1704614610000, type: "ask_user", content: "Proceed?" },
    { time: 1704614610000, type: "user_responed", content: "yes" }
  ]]);
});

test("content is normalized to one line and sensitive values are redacted", async () => {
  const { capture, env } = await makeEnv();
  await runHook(
    "postToolUse",
    {
      timestamp: 1704614700004,
      cwd: ROOT,
      toolName: "ask_user",
      toolArgs: JSON.stringify({ message: "Token?\nghp_abcdefghijklmnopqrstuvwxyz123456" }),
      toolResult: {
        resultType: "success",
        textResultForLlm: "Answer:\nghp_abcdefghijklmnopqrstuvwxyz123456"
      }
    },
    env
  );
  await runHook("agentStop", { timestamp: 1704617900004, cwd: ROOT }, env);

  const payloads = await readIngestedJson(capture);
  assert.deepEqual(payloads, [[
    { time: 1704614700004, type: "ask_user", content: "[redacted: sensitive content]" },
    { time: 1704614700004, type: "user_responed", content: "[redacted: sensitive content]" }
  ]]);
  assert.doesNotMatch(JSON.stringify(payloads), /ghp_abcdefghijklmnopqrstuvwxyz123456/);
});

test("agentStop with no recorded user content does not ingest", async () => {
  const { capture, env } = await makeEnv();
  await runHook("agentStop", { timestamp: 1704617900100, cwd: ROOT }, env);

  assert.deepEqual(await readCapture(capture), []);
});

test("trace mode records the agentStop flush decision", async () => {
  const { stateDir, env } = await makeEnv();
  const traceEnv = { ...env, MEMORY_HOOK_TRACE: "1" };
  await runHook(
    "userPromptSubmitted",
    {
      timestamp: 1704614500300,
      cwd: ROOT,
      prompt: "帮我追踪记录了什么。"
    },
    traceEnv
  );
  await runHook("agentStop", { timestamp: 1704617900300, cwd: ROOT }, traceEnv);

  const trace = await readTrace(stateDir);
  const events = trace.map((entry) => entry.event);
  assert.ok(events.includes("flow.eventCached"));
  assert.ok(events.includes("extract.agentStopFlow"));
  assert.ok(events.includes("ingest.succeeded"));
  assert.ok(events.includes("agentStop.flowFlushed"));
});

test("new user prompt discards stale unflushed records", async () => {
  const { capture, env } = await makeEnv();
  await runHook(
    "userPromptSubmitted",
    {
      timestamp: 1704614500000,
      cwd: ROOT,
      prompt: "old prompt"
    },
    env
  );
  await runHook(
    "postToolUse",
    {
      timestamp: 1704614510000,
      cwd: ROOT,
      toolName: "ask_user",
      toolArgs: { message: "old question" },
      toolResult: { resultType: "success", textResultForLlm: "old answer" }
    },
    env
  );
  await runHook(
    "userPromptSubmitted",
    {
      timestamp: 1704614600000,
      cwd: ROOT,
      prompt: "new prompt"
    },
    env
  );
  await runHook("agentStop", { timestamp: 1704617900000, cwd: ROOT }, env);

  const payloads = await readIngestedJson(capture);
  assert.deepEqual(payloads, [[
    { time: 1704614600000, type: "user_prompt", content: "new prompt" }
  ]]);
});

test("successful ingest removes the temporary ingest file", async () => {
  const { capture, env } = await makeEnv();
  await runHook(
    "userPromptSubmitted",
    {
      timestamp: 1704614500000,
      cwd: ROOT,
      prompt: "clean up temp ingest file"
    },
    env
  );
  await runHook("agentStop", { timestamp: 1704617900000, cwd: ROOT }, env);

  const calls = await readCapture(capture);
  assert.equal(calls.length, 1);
  await assert.rejects(fs.stat(calls[0].filePath), { code: "ENOENT" });
});
