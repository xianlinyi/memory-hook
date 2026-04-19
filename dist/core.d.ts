import type { HookConfig, HookName, PostToolUseInput, SessionEndInput, UserPromptSubmittedInput } from "./types.js";
export declare function handleUserPromptSubmitted(input: UserPromptSubmittedInput, config: HookConfig): Promise<void>;
export declare function handlePostToolUse(input: PostToolUseInput, config: HookConfig): Promise<void>;
export declare function handleAgentStop(input: SessionEndInput, config: HookConfig): Promise<void>;
export declare function handleHook(hookName: HookName, input: unknown, config: HookConfig): Promise<void>;
