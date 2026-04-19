import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Re-run startup check at most once per hour per stateDir.
const SESSION_LOCK_TTL_MS = 60 * 60 * 1000;
function resourceDir() {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "resource");
}
export async function runStartupCheck(stateDir) {
    const lockFile = path.join(stateDir, "session-start.lock");
    try {
        const stat = await fs.stat(lockFile);
        if (Date.now() - stat.mtimeMs < SESSION_LOCK_TTL_MS)
            return;
    }
    catch {
        // lock file absent — first run this session
    }
    await doStartupCheck(stateDir, lockFile);
}
async function doStartupCheck(stateDir, lockFile) {
    process.stderr.write("⠿ Memory Hook active\n");
    const copilotDir = path.join(os.homedir(), ".copilot");
    const warnings = [];
    // Check ~/.copilot/memory-hook-prompt.md exists
    try {
        await fs.access(path.join(copilotDir, "memory-hook-prompt.md"));
    }
    catch {
        warnings.push("  • ~/.copilot/memory-hook-prompt.md not found");
    }
    // Check ~/.copilot/copilot-instructions.md contains required content
    try {
        const required = await fs.readFile(path.join(resourceDir(), "copilot-instructions.md"), "utf8");
        const existing = await fs.readFile(path.join(copilotDir, "copilot-instructions.md"), "utf8").catch(() => "");
        if (!existing.includes(required.trim())) {
            warnings.push("  • ~/.copilot/copilot-instructions.md is missing memory-hook content");
        }
    }
    catch {
        // resource file unreadable — skip check
    }
    if (warnings.length > 0) {
        process.stderr.write(`⚠  Memory Hook: setup incomplete — copy the files from resource/ to ~/.copilot/:\n${warnings.join("\n")}\n`);
    }
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(lockFile, new Date().toISOString(), "utf8");
}
//# sourceMappingURL=startup.js.map