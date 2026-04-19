import os from "node:os";
import path from "node:path";

import type { HookConfig } from "./types.js";

function defaultCacheDir(): string {
  if (process.env.MEMORY_HOOK_STATE_DIR) {
    return process.env.MEMORY_HOOK_STATE_DIR;
  }

  if (process.env.XDG_CACHE_HOME) {
    return path.join(process.env.XDG_CACHE_HOME, "github-copilot-memory-hook");
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Caches", "github-copilot-memory-hook");
  }

  return path.join(os.homedir(), ".cache", "github-copilot-memory-hook");
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): HookConfig {
  return {
    ingestCommand: process.env.MEMORY_HOOK_INGEST_CMD ?? "agent-memory ingest",
    stateDir: defaultCacheDir(),
    minImmediateImportance: numberFromEnv("MEMORY_HOOK_IMMEDIATE_THRESHOLD", 0.84),
    minSessionEndImportance: numberFromEnv("MEMORY_HOOK_SESSION_THRESHOLD", 0.72),
    maxEvidenceChars: numberFromEnv("MEMORY_HOOK_MAX_EVIDENCE_CHARS", 4000)
  };
}
