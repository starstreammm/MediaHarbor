import type { CursorGet, CursorRes, CursorFilter } from "~/model/cursor";
import type { TableCreator, DetailsCreator, TablePost, TableAccount } from "~/model/table";

import { api } from "~/hooks/api";
import { pushError } from "~/components/error_popout";



export async function getCreators(cursor: CursorGet, filter?: CursorFilter) {
    try {
        const res = await api.post("/api/creator/ls", { json: { ...cursor, filter: filter } }).json<CursorRes<TableCreator>>();
        return res;
    }
    catch (err) { pushError(err, "Fetch creators"); }
}

export async function updateCreators(uid: number, data: DetailsCreator) {
    try {
        await api.post("/api/creator/update", { json: data, searchParams: { uid } })
    }
    catch (err) { pushError(err, "Update creator"); }
}

export async function deleteCreators(uid: number) {
    try {
        await api.post("/api/creator/delete", { json: { uid } })
    }
    catch (err) {
        pushError(err, "Delete creator");
        throw err;
    }
}

export async function getAccounts(uid: number) {
    try {
        const res = await api.get("/api/creator/accounts", { searchParams: { uid } }).json<TableAccount[]>();
        return res;
    } catch (error) {
        pushError("Fetch accounts");
        throw error;
    }
}

export async function getPostsLs(uids: number[], cursor: CursorGet, filter?: CursorFilter) {
    try {
        const res = await api.post(
            "/api/creator/posts",
            {
                json: { ...cursor, filter },
                searchParams: { accounts: uids.join(",") }
            }
        ).json<CursorRes<TablePost>>();
        return res;
    }
    catch (err) {
        pushError(err, "Fetch posts");
        throw err;
    }
}