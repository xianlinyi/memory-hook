import fs from "node:fs/promises";
import path from "node:path";

export async function debugLog(stateDir: string, message: string): Promise<void> {
  if (process.env.MEMORY_HOOK_DEBUG !== "1") return;
  await fs.mkdir(stateDir, { recursive: true });
  await fs.appendFile(path.join(stateDir, "debug.log"), `${new Date().toISOString()} ${message}\n`, "utf8");
}

export async function traceLog(
  stateDir: string,
  event: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  if (process.env.MEMORY_HOOK_TRACE !== "1") return;
  await fs.mkdir(stateDir, { recursive: true });
  const line = JSON.stringify({
    time: new Date().toISOString(),
    event,
    ...details
  });
  await fs.appendFile(path.join(stateDir, "trace.jsonl"), `${line}\n`, "utf8");
}
