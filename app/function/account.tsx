import { api } from "~/hooks/api";
import { pushError, pushMsg } from "~/components/error_popout";
import type {
    ApiAccountCreate,
    ApiAccountInsert,
    ApiAccountSync,
    ApiAccountParse,
} from "~/model/api";
import type { DetailsAccount, DetailsPost, TablePost } from "~/model/table";
import type { CursorGet, CursorRes, CursorFilter } from "~/model/cursor";
import type { Platform } from "~/model/enum";


export async function checkUrl(url: string) {
    try {
        const res = await api.get("/api/account/check", { searchParams: { url } }).json<[string, [Platform, string] | null]>();
        if (res[0] === "true") {
            return res[1] ? res[1][0] : "Unknown platform";
        }
        else {
            return res[0];
        }
    } catch (error) {
        return "Error checking URL: " + (error as Error).message;
    }
}

export async function createSubmit(data: ApiAccountCreate) {
    try {
        const res = await api.post("/api/account/create", { json: data }).json<number>();
        return res;
    } catch (error) {
        pushError(error, "Create account");
        throw error;
    }
}

export async function parseSubmit(data: ApiAccountParse) {
    try {
        const res = await api.post("/api/account/parse", { json: data }).json<number>();
        return res;
    } catch (error) {
        pushError(error, "Create parse account");
        throw error;
    }
}

export async function insertSubmit(data: ApiAccountInsert) {
    try {
        const res = await api.post("/api/account/insert", { json: data }).json<number>();
        return res;
    } catch (error) {
        pushError(error, "Insert account");
        throw error;
    }
}

export async function syncSubmit(data: ApiAccountSync) {
    try {
        const res = await api.post("/api/account/sync", { json: data }).json<number>();
        return res;
    } catch (error) {
        pushError(error, "Sync account");
        throw error;
    }
}

export async function getProfile(url: string) {
    try {
        const res = await api.get("/api/account/profile/url", { searchParams: { url } }).json<DetailsAccount>();
        return res;
    } catch (error) {
        pushError(error, "Get account profile");
        throw error;
    }
}

export async function* getPostsFromUrl(url: string): AsyncGenerator<DetailsPost[]> {
    try {
        const decoder = new TextDecoder("utf-8");
        const reader = (
            await api.get("/api/account/posts/url", {
                searchParams: { url },
                timeout: false
            })).body?.getReader();
        if (reader === undefined) {
            pushMsg("Response body is empty", "error");
            throw new Error("Response body is empty");
        }

        let buffer = "";

        while (true) {
            try {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    if (!line.trim()) continue;
                    yield JSON.parse(line) as DetailsPost[];
                }
            }
            catch (error) { pushError(error, "Get account posts"); }
        }

        buffer += decoder.decode();
        if (buffer.trim()) {
            yield JSON.parse(buffer) as DetailsPost[];
        }
    } catch (error) {
        pushError(error, "Get account posts");
        throw error;
    }
}

export async function getPostsLs(account_uid: number, cursor: CursorGet, filter?: CursorFilter) {
    try {
        const res = await api.post(
            "/api/account/posts",
            {
                json: { ...cursor, filter: filter },
                searchParams: { uid: account_uid }
            }
        ).json<CursorRes<TablePost>>();
        return res;
    }
    catch (err) {
        pushError(err, "Fetch posts");
        throw err;
    }
}
