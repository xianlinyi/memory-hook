import { debugLog, traceLog } from "./log.js";
import { sha256 } from "./hash.js";
import { ingestCandidate } from "./ingest.js";
import { appendCandidate, appendFlowEvent, clearFlowEvents, readFlowEvents } from "./state.js";
import { hasSensitiveContent, normalizeText } from "./text.js";
const FLOW_MEMORY_IMPORTANCE = 0.9;
function candidateSummary(candidate) {
    return {
        id: candidate.id,
        kind: candidate.kind,
        hook: candidate.hook,
        importance: Number(candidate.importance.toFixed(2)),
        ingested: candidate.ingested,
        attempts: candidate.ingestAttempts,
        evidenceHash: candidate.evidenceHash,
        text: candidate.text
    };
}
function timestamp(input) {
    return typeof input.timestamp === "number" ? input.timestamp : Date.now();
}
function cwd(input) {
    return input.cwd || process.cwd();
}
function redactString(value) {
    return hasSensitiveContent(value) ? "[redacted: sensitive content]" : value;
}
function parseToolArgs(value) {
    if (typeof value !== "string")
        return value;
    try {
        return JSON.parse(value);
    }
    catch {
        return value;
    }
}
function textFromUnknown(value) {
    if (typeof value === "string")
        return value;
    if (Array.isArray(value)) {
        return value.map(textFromUnknown).filter(Boolean).join("\n");
    }
    if (!value || typeof value !== "object")
        return "";
    const record = value;
    const direct = record.message ?? record.question ?? record.prompt ?? record.text ?? record.title;
    if (direct)
        return textFromUnknown(direct);
    if (record.questions)
        return textFromUnknown(record.questions);
    return "";
}
function singleLine(value) {
    return value.replace(/\s+/g, " ").trim();
}
function item(time, type, content) {
    const cleaned = singleLine(redactString(content));
    return cleaned ? { time, type, content: cleaned } : undefined;
}
function askUserText(input) {
    return textFromUnknown(parseToolArgs(input.toolArgs));
}
function userResponseText(input) {
    return typeof input.toolResult?.textResultForLlm === "string"
        ? input.toolResult.textResultForLlm
        : "";
}
async function recordItems(config, hook, input, items) {
    if (items.length === 0)
        return;
    const event = {
        hook,
        timestamp: timestamp(input),
        cwd: cwd(input),
        data: { items }
    };
    await appendFlowEvent(config.stateDir, event);
    await traceLog(config.stateDir, "flow.eventCached", {
        hook,
        cwd: event.cwd,
        timestamp: event.timestamp,
        items: items.length
    });
}
function itemsFromEvents(events) {
    const ordered = [...events].sort((a, b) => a.timestamp - b.timestamp);
    const items = ordered.flatMap((event) => {
        const rawItems = event.data.items;
        return Array.isArray(rawItems) ? rawItems : [];
    });
    const seen = new Set();
    const unique = [];
    for (const current of items) {
        const key = `${current.time}\0${current.type}\0${current.content}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        unique.push(current);
    }
    return unique;
}
function makeFlowCandidate(events, terminalInput) {
    const payload = itemsFromEvents(events);
    const evidence = JSON.stringify(payload);
    if (!payload.length || hasSensitiveContent(evidence))
        return undefined;
    const evidenceHash = sha256(normalizeText(`interaction:${evidence}`));
    return {
        id: evidenceHash.slice(0, 24),
        kind: "interaction",
        text: "Chronological user prompt and ask_user response list.",
        importance: FLOW_MEMORY_IMPORTANCE,
        evidence,
        evidenceHash,
        hook: "agentStop",
        timestamp: timestamp(terminalInput),
        cwd: cwd(terminalInput),
        ingested: false,
        ingestAttempts: 0,
        payload
    };
}
async function ingestAndMark(config, candidate) {
    const updated = { ...candidate, ingestAttempts: candidate.ingestAttempts + 1 };
    await traceLog(config.stateDir, "ingest.started", {
        candidate: candidateSummary(updated)
    });
    const result = await ingestCandidate(config, updated);
    if (result.ok) {
        await traceLog(config.stateDir, "ingest.succeeded", {
            candidate: candidateSummary(updated),
            filePath: result.filePath
        });
        return { ...updated, ingested: true, lastError: undefined };
    }
    await debugLog(config.stateDir, `ingest failed for ${candidate.evidenceHash}: ${result.error ?? "unknown error"}`);
    await traceLog(config.stateDir, "ingest.failed", {
        candidate: candidateSummary(updated),
        filePath: result.filePath,
        error: result.error ?? "unknown error"
    });
    return { ...updated, ingested: false, lastError: result.error ?? "unknown error" };
}
async function flushFlowAtAgentStop(config, input) {
    const currentCwd = cwd(input);
    const flowEvents = await readFlowEvents(config.stateDir, currentCwd);
    const flowCandidate = flowEvents.length > 0
        ? makeFlowCandidate(flowEvents, input)
        : undefined;
    await traceLog(config.stateDir, "extract.agentStopFlow", {
        count: flowCandidate ? 1 : 0,
        events: flowEvents.length,
        candidates: flowCandidate ? [candidateSummary(flowCandidate)] : []
    });
    if (flowCandidate) {
        const finalCandidate = await ingestAndMark(config, flowCandidate);
        await appendCandidate(config.stateDir, finalCandidate);
    }
    await clearFlowEvents(config.stateDir, currentCwd);
    await traceLog(config.stateDir, "agentStop.flowFlushed", {
        cwd: currentCwd,
        events: flowEvents.length,
        ingested: Boolean(flowCandidate)
    });
}
export async function handleUserPromptSubmitted(input, config) {
    await clearFlowEvents(config.stateDir, cwd(input));
    const promptItem = item(timestamp(input), "user_prompt", input.prompt ?? "");
    await recordItems(config, "userPromptSubmitted", input, promptItem ? [promptItem] : []);
    await traceLog(config.stateDir, "extract.userPromptSubmitted", {
        count: promptItem ? 1 : 0
    });
}
export async function handlePostToolUse(input, config) {
    const items = [];
    if (input.toolName === "ask_user") {
        const time = timestamp(input);
        const askItem = item(time, "ask_user", askUserText(input));
        const responseItem = item(time, "user_responed", userResponseText(input));
        if (askItem)
            items.push(askItem);
        if (responseItem)
            items.push(responseItem);
        await recordItems(config, "postToolUse", input, items);
    }
    await traceLog(config.stateDir, "extract.postToolUse", {
        count: items.length
    });
}
export async function handleAgentStop(input, config) {
    await flushFlowAtAgentStop(config, input);
}
export async function handleHook(hookName, input, config) {
    if (hookName === "userPromptSubmitted") {
        await handleUserPromptSubmitted(input, config);
        return;
    }
    if (hookName === "postToolUse") {
        await handlePostToolUse(input, config);
        return;
    }
    if (hookName === "agentStop") {
        await handleAgentStop(input, config);
    }
}
//# sourceMappingURL=core.js.map