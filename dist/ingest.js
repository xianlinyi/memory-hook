import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { sha256 } from "./hash.js";
function splitCommand(command) {
    const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
    return parts.map((part) => {
        if ((part.startsWith('"') && part.endsWith('"')) ||
            (part.startsWith("'") && part.endsWith("'"))) {
            return part.slice(1, -1);
        }
        return part;
    });
}
export function renderMemoryJson(candidate) {
    const payload = candidate.payload ?? {
        source: "github-copilot-memory-hook",
        kind: candidate.kind,
        importance: candidate.importance,
        hook: candidate.hook,
        cwd: candidate.cwd,
        timestamp: candidate.timestamp,
        text: candidate.text,
        evidence: candidate.evidence
    };
    return `${JSON.stringify(payload, null, 2)}\n`;
}
async function writeMemoryFile(config, candidate) {
    const dir = path.join(config.stateDir, "ingest");
    await fs.mkdir(dir, { recursive: true });
    const fileName = `${candidate.timestamp}-${sha256(candidate.id).slice(0, 16)}.json`;
    const filePath = path.join(dir, fileName);
    await fs.writeFile(filePath, renderMemoryJson(candidate), "utf8");
    return filePath;
}
export async function ingestCandidate(config, candidate) {
    const filePath = await writeMemoryFile(config, candidate);
    const parts = splitCommand(config.ingestCommand);
    if (parts.length === 0) {
        return { ok: false, filePath, error: "MEMORY_HOOK_INGEST_CMD is empty" };
    }
    const [executable, ...args] = parts;
    return new Promise((resolve) => {
        const child = spawn(executable, [...args, filePath], {
            env: process.env,
            stdio: ["ignore", "ignore", "pipe"]
        });
        let stderr = "";
        child.stderr?.on("data", (chunk) => {
            stderr += chunk.toString("utf8");
        });
        child.on("error", (error) => {
            resolve({ ok: false, filePath, error: error.message });
        });
        child.on("close", async (code) => {
            if (code === 0) {
                await fs.unlink(filePath).catch(() => undefined);
                resolve({ ok: true, filePath });
                return;
            }
            resolve({
                ok: false,
                filePath,
                error: stderr.trim() || `ingest command exited with code ${code}`
            });
        });
    });
}
//# sourceMappingURL=ingest.js.map