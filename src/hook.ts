#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { handleHook } from "./core.js";
import { debugLog, traceLog } from "./log.js";
import { firstUsefulLine, hasSensitiveContent, trimNoise, truncate } from "./text.js";
import type { HookName } from "./types.js";

const HOOKS = new Set(["userPromptSubmitted", "postToolUse", "agentStop"]);

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function inputSummary(hookName: string, input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return { inputType: typeof input };
  const record = input as Record<string, unknown>;
  const base = {
    cwd: typeof record.cwd === "string" ? record.cwd : undefined,
    timestamp: typeof record.timestamp === "number" ? record.timestamp : undefined
  };

  if (hookName === "userPromptSubmitted") {
    const prompt = typeof record.prompt === "string" ? record.prompt : "";
    return { ...base, promptChars: prompt.length };
  }

  if (hookName === "postToolUse") {
    const toolName = typeof record.toolName === "string" ? record.toolName : undefined;
    const toolResult = record.toolResult && typeof record.toolResult === "object"
      ? (record.toolResult as Record<string, unknown>)
      : {};
    const resultText = typeof toolResult.textResultForLlm === "string"
      ? toolResult.textResultForLlm
      : "";
    const summary: Record<string, unknown> = {
      ...base,
      toolName,
      toolArgs: typeof record.toolArgs === "string" ? previewToolArgs(record.toolArgs) : undefined
    };
    if (hookName === "postToolUse") {
      summary.resultType = typeof toolResult.resultType === "string" ? toolResult.resultType : undefined;
      summary.resultChars = resultText.length;
    }
    if (toolName === "ask_user") {
      const question = questionPreviewFromToolArgs(
        typeof record.toolArgs === "string" ? record.toolArgs : undefined
      );
      const answer = previewText(resultText);
      if (question) summary.question = question;
      if (answer) summary.answer = answer;
    }
    return summary;
  }

  if (hookName === "agentStop") {
    return {
      ...base,
      reason: typeof record.reason === "string" ? record.reason : undefined,
      stopReason: typeof record.stopReason === "string" ? record.stopReason : undefined,
      status: typeof record.status === "string" ? record.status : undefined,
      hasMessages: "messages" in record,
      hasConversation: "conversation" in record,
      hasTurns: "turns" in record,
      hasTranscript: "transcript" in record
    };
  }

  return base;
}

function previewText(text: string): string {
  const preview = truncate(firstUsefulLine(trimNoise(text)), 240);
  return preview && !hasSensitiveContent(preview) ? preview : "";
}

function questionPreviewFromToolArgs(raw: string | undefined): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return previewText(questionTextFromUnknown(parsed));
  } catch {
    return previewText(raw);
  }
}

function questionTextFromUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(questionTextFromUnknown).filter(Boolean).join("\n");
  }
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  const direct = record.question ?? record.prompt ?? record.message ?? record.text ?? record.title;
  if (direct) return questionTextFromUnknown(direct);
  if (record.questions) return questionTextFromUnknown(record.questions);
  return "";
}

function previewToolArgs(raw: string): unknown {
  if (hasSensitiveContent(raw)) return "[redacted: sensitive content]";
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return previewText(raw);
    if (Array.isArray(parsed)) return parsed.length === 0 ? [] : `[array:${parsed.length}]`;

    const record = parsed as Record<string, unknown>;
    const summary: Record<string, unknown> = {};
    for (const key of ["command", "cmd", "description", "question", "prompt", "message"]) {
      const value = record[key];
      if (typeof value === "string") summary[key] = previewText(value);
    }
    return Object.keys(summary).length > 0 ? summary : `[object:${Object.keys(record).length}]`;
  } catch {
    return previewText(raw);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const hookName = process.argv[2];
  if (!HOOKS.has(hookName)) {
    await debugLog(config.stateDir, `unsupported hook name: ${hookName ?? "<missing>"}`);
    return;
  }

  const raw = await readStdin();
  if (!raw.trim()) {
    await debugLog(config.stateDir, `empty input for ${hookName}`);
    return;
  }

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch (error) {
    await debugLog(config.stateDir, `invalid JSON for ${hookName}: ${(error as Error).message}`);
    return;
  }

  await traceLog(config.stateDir, "hook.received", {
    hook: hookName,
    input: inputSummary(hookName, input)
  });
  await handleHook(hookName as HookName, input, config);
  await traceLog(config.stateDir, "hook.completed", { hook: hookName });
}

main().catch(async (error) => {
  const config = loadConfig();
  await debugLog(config.stateDir, `hook failed: ${(error as Error).stack ?? String(error)}`);
  process.exitCode = 0;
});
