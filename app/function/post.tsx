import type { CursorGet, CursorRes, CursorFilter } from "~/model/cursor";
import type { TablePost } from "~/model/table";

import { api } from "~/hooks/api";
import { pushError } from "~/components/error_popout";
import type { ApiPostInsert } from "~/model/api";
import type { Platform } from "~/model/enum";



export async function getPosts(cursor: CursorGet, filter?: CursorFilter) {
    try {
        const res = await api.post("/api/post/ls", { json: { ...cursor, filter: filter } }).json<CursorRes<TablePost>>();
        return res;
    }
    catch (err) {
        pushError(err, "Fetch posts");
        throw err;
    }
}

export async function updateRate(uid: number, newRate: number) {
    try {
        await api.post("/api/post/update", { json: { uid: uid, rate: newRate } })
    }
    catch (err) {
        pushError(err, "Update post rate");
        throw err;
    }
}

export async function getPostCover(uid: number) {
    try {
        const res = await api.get("/api/post/cover", { searchParams: { uid } }).json<number | null | undefined>();
        if (res === null || res === undefined)
            return -1;
        else
            return res;
    }
    catch (err) {
        pushError(err, "Fetch post cover");
        return -3;
    }
}

export async function deletePost(uid: number) {
    try {
        await api.post("/api/post/delete", { json: { uid } });
    }
    catch (err) {
        pushError(err, "Delete post");
        throw err;
    }
}

export async function checkUrl(url: string) {
    try {
        const res = await api.get("/api/post/check", { searchParams: { url } }).json<[string, [Platform, string] | null]>();
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

export async function createSubmit(url: string) {
    try {
        const res = await api.post("/api/post/create", { json: { url } }).json<number>();
        return res;
    } catch (error) {
        pushError(error, "Create post");
        throw error;
    }
}

export async function insertSubmit(data: ApiPostInsert) {
    try {
        const res = await api.post("/api/post/insert", { json: data }).json<number>();
        return res;
    } catch (error) {
        pushError(error, "Insert post");
        throw error;
    }
}