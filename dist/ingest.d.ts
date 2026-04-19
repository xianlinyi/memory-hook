import type { HookConfig, MemoryCandidate } from "./types.js";
export interface IngestResult {
    ok: boolean;
    filePath: string;
    error?: string;
}
export declare function renderMemoryJson(candidate: MemoryCandidate): string;
export declare function ingestCandidate(config: HookConfig, candidate: MemoryCandidate): Promise<IngestResult>;
