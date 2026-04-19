import fs from "node:fs/promises";
import path from "node:path";
import { sha256 } from "./hash.js";
export function stateFileForCwd(stateDir, cwd) {
    const cwdHash = sha256(cwd || "unknown").slice(0, 24);
    return path.join(stateDir, `${cwdHash}.jsonl`);
}
export function flowFileForCwd(stateDir, cwd) {
    const cwdHash = sha256(cwd || "unknown").slice(0, 24);
    return path.join(stateDir, `${cwdHash}.flow.jsonl`);
}
export async function readCandidates(stateDir, cwd) {
    const filePath = stateFileForCwd(stateDir, cwd);
    try {
        const raw = await fs.readFile(filePath, "utf8");
        return raw
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => JSON.parse(line));
    }
    catch (error) {
        if (error.code === "ENOENT")
            return [];
        throw error;
    }
}
export async function appendCandidate(stateDir, candidate) {
    await fs.mkdir(stateDir, { recursive: true });
    const filePath = stateFileForCwd(stateDir, candidate.cwd);
    await fs.appendFile(filePath, `${JSON.stringify(candidate)}\n`, "utf8");
}
export async function replaceCandidates(stateDir, cwd, candidates) {
    await fs.mkdir(stateDir, { recursive: true });
    const filePath = stateFileForCwd(stateDir, cwd);
    const body = candidates.map((candidate) => JSON.stringify(candidate)).join("\n");
    await fs.writeFile(filePath, body ? `${body}\n` : "", "utf8");
}
export function hasCandidate(candidates, evidenceHash) {
    return candidates.some((candidate) => candidate.evidenceHash === evidenceHash);
}
export async function appendFlowEvent(stateDir, event) {
    await fs.mkdir(stateDir, { recursive: true });
    await fs.appendFile(flowFileForCwd(stateDir, event.cwd), `${JSON.stringify(event)}\n`, "utf8");
}
export async function readFlowEvents(stateDir, cwd) {
    const filePath = flowFileForCwd(stateDir, cwd);
    try {
        const raw = await fs.readFile(filePath, "utf8");
        return raw
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => JSON.parse(line));
    }
    catch (error) {
        if (error.code === "ENOENT")
            return [];
        throw error;
    }
}
export async function clearFlowEvents(stateDir, cwd) {
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(flowFileForCwd(stateDir, cwd), "", "utf8");
}
//# sourceMappingURL=state.js.map