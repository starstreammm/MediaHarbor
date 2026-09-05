import { api } from "~/hooks/api";
import { pushError, pushMsg } from "~/components/error_popout";
import type { ApiInitStatus } from "~/model/api";
import type { TableSettings } from "~/model/table";
import { Platform } from "~/model/enum";



export function removeComments(text: string): string {
    return text
        .split(/\r?\n/)
        .filter(line => !line.trimStart().startsWith("//"))
        .join("\n");
}


export async function* fetchApiInitStatus(
    oldC: TableSettings,
    newC: TableSettings,
    onError?: () => void,
): AsyncGenerator<ApiInitStatus, void, unknown> {
    // Determine which platforms need to be initialized based on changes in settings
    let todo: ApiInitStatus = {};
    for (const p of Platform) {
        const key = `cookie_${p}` as keyof TableSettings;
        if (oldC[key] !== newC[key] && newC[key]) {
            todo[p] = newC[key] as string;
        }
    }

    // If no platforms need to be initialized, throw an error
    if (Object.keys(todo).length === 0) {
        onError?.();
        pushMsg("No changes detected.", "info");
        throw new Error("No changes detected.");
    }

    // Fetch the initialization status from the API
    const decoder = new TextDecoder("utf-8");
    const reader = (
        await api.post("/api/init/api", {
            json: todo,
            timeout: false
        })
    ).body?.getReader()!;
    if (reader === undefined) {
        onError?.();
        pushMsg("Response body is empty", "error");
        throw new Error("Response body is empty");
    }

    // Read the response stream and yield the parsed JSON lines
    let buffer = "";
    let errorOccurred = false;
    while (true) {
        try {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                if (!line.trim()) continue;
                yield JSON.parse(line);
            }
        }
        catch (error) {
            pushError(error, "API Initialization Progress");
            errorOccurred = true;
        }
    }

    // Process any remaining buffer after the stream is done
    buffer += decoder.decode();
    if (buffer.trim()) {
        yield JSON.parse(buffer);
    }

    // If any errors occurred during the process, throw an error to indicate failure
    if (errorOccurred) {
        onError?.();
        throw new Error("An error occurred during the API initialization process.");
    }
}