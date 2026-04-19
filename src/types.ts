export type HookName =
  | "userPromptSubmitted"
  | "postToolUse"
  | "agentStop";

export interface BaseHookInput {
  timestamp?: number;
  cwd?: string;
}

export interface UserPromptSubmittedInput extends BaseHookInput {
  prompt?: string;
}

export interface PostToolUseInput extends BaseHookInput {
  toolName?: string;
  toolArgs?: unknown;
  toolResult?: {
    resultType?: "success" | "failure" | "denied" | string;
    textResultForLlm?: string;
  };
}

export interface SessionEndInput extends BaseHookInput {
  reason?: string;
  transcript?: unknown;
  messages?: unknown;
  conversation?: unknown;
  turns?: unknown;
}

export type MemoryKind =
  | "preference"
  | "constraint"
  | "interaction"
  | "project_fact"
  | "decision"
  | "environment";

export interface MemoryCandidate {
  id: string;
  kind: MemoryKind;
  text: string;
  importance: number;
  evidence: string;
  evidenceHash: string;
  hook: HookName;
  timestamp: number;
  cwd: string;
  ingested: boolean;
  ingestAttempts: number;
  lastError?: string;
  payload?: unknown;
}

export interface FlowEvent {
  hook: HookName;
  timestamp: number;
  cwd: string;
  data: Record<string, unknown>;
}

export interface HookConfig {
  ingestCommand: string;
  stateDir: string;
  minImmediateImportance: number;
  minSessionEndImportance: number;
  maxEvidenceChars: number;
}
