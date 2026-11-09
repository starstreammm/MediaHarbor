import { api } from "~/hooks/api";
import type { ApiInitStatus } from "~/model/api";
import type { TableSettings } from "~/model/table";


export function initializeSettings(config: Partial<TableSettings>) {
    return api.post("/api/init/settings", { json: config }).json<TableSettings>();
}


export function removeComments(text: string): string {
    return text
        .split(/\r?\n/)
        .filter(line => !line.trimStart().startsWith("//"))
        .join("\n");
}


export async function* fetchApiInitStatus(
    credentials: ApiInitStatus = {},
): AsyncGenerator<ApiInitStatus, void, unknown> {
    const response = await api.post("/api/init/api", { json: credentials, timeout: false });
    const reader = response.body?.getReader();
    if (!reader) throw new Error("The initialization response has no body.");

    const decoder = new TextDecoder();
    let buffer = "";
    let last: ApiInitStatus | undefined;
    let finished = false;
    const parse = (line: string): ApiInitStatus => {
        const value: unknown = JSON.parse(line);
        if (!value || typeof value !== "object" || Array.isArray(value)
            || Object.values(value).some(item => item !== null && typeof item !== "string")) {
            throw new Error("Invalid initialization status response.");
        }
        return value as ApiInitStatus;
    };
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                finished = true;
                break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (!line.trim()) continue;
                last = parse(line);
                yield last;
            }
        }
        buffer += decoder.decode();
        if (buffer.trim()) {
            last = parse(buffer);
            yield last;
        }
        if (!last || Object.values(last).some(value => value === "")) {
            throw new Error("Initialization ended before all APIs reported a result.");
        }
        const failures = Object.entries(last).filter(([, value]) => value != null && value !== "true" && value !== "false");
        if (failures.length) {
            throw new Error(failures.map(([key, value]) => `${key}: ${value}`).join("; "));
        }
    } finally {
        if (!finished) await reader.cancel();
        reader.releaseLock();
    }
}
