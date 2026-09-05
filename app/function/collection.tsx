import type { CursorGet, CursorRes, CursorFilter } from "~/model/cursor";
import type { TableCollection, TablePost } from "~/model/table";
import type { ApiCollectionCreate, ApiCollectionUpdate } from "~/model/api";

import { api } from "~/hooks/api";
import { pushError } from "~/components/error_popout";



export async function getCollections(cursor: CursorGet, filter?: CursorFilter) {
    try {
        const res = await api.post("/api/collection/ls", { json: { ...cursor, filter: filter } }).json<CursorRes<TableCollection>>();
        return res;
    }
    catch (err) {
        pushError(err, "Fetch collections");
        throw err;
    }
}

export async function getSingleCollection(uid: number) {
    try {
        const res = await api.get("/api/collection/single", { searchParams: { uid } }).json<TableCollection>();
        return res;
    }
    catch (err) {
        pushError(err, "Fetch collection");
        throw err;
    }
}

export async function updateCollections(data: ApiCollectionUpdate) {
    try {
        await api.post("/api/collection/update", { json: data })
    }
    catch (err) {
        pushError(err, "Update collection");
        throw err;
    }
}

export async function deleteCollection(uid: number) {
    try {
        await api.post("/api/collection/delete", { json: { uid } })
    }
    catch (err) {
        pushError(err, "Delete collection");
        throw err;
    }
}

export async function createCollection(data: ApiCollectionCreate) {
    try {
        const res = await api.post("/api/collection/create", { json: data }).json<number>();
        return res;
    } catch (error) {
        pushError(error, `Create collection ${data.alias}`);
        throw error;
    }
}

export async function getPostDetail(uid: number) {
    try {
        const res = await api.get("/api/post/single", { searchParams: { uid } }).json<TablePost>();
        return res;
    } catch (error) {
        pushError(error, `Get post detail ${uid}`);
        throw error;
    }
}