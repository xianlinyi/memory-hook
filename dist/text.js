const SECRET_PATTERNS = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
    /\b(?:api[_-]?key|token|secret|password|passwd|pwd)\b\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{12,}/i,
    /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
    /\bsk-[A-Za-z0-9]{20,}\b/,
    /\b[A-Za-z0-9+/]{40,}={0,2}\b/
];
export function normalizeText(text) {
    return text
        .toLowerCase()
        .replace(/`+/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
export function hasSensitiveContent(text) {
    return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}
export function truncate(text, maxChars) {
    if (text.length <= maxChars)
        return text;
    return `${text.slice(0, maxChars).trimEnd()}\n...[truncated]`;
}
export function trimNoise(text) {
    return text
        .replace(/\x1B\[[0-9;]*m/g, "")
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => line.replace(/^\s*\d+\.\s?(?=\S|$)/, ""))
        .join("\n")
        .trim();
}
export function firstUsefulLine(text) {
    const line = text
        .split("\n")
        .map((item) => item.trim())
        .find((item) => item.length > 0);
    return line ?? "";
}
//# sourceMappingURL=text.js.map