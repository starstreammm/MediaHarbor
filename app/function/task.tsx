import { pushError } from "~/components/error_popout";
import { api } from "~/hooks/api";
import type { Status } from "~/model/enum";
import type { DownloadStatus, TableQueue } from "../pages/tasks/model";

export async function getDownloadStatus(gid?: string) {
    if (!gid)
        return null;
    try {
        const res = await api.get(`/api/queue/download`, { searchParams: { gid } }).json<DownloadStatus>();
        return res;
    } catch (error) {
        pushError(error, "Fetch download status");
        throw error;
    }
}

export async function fetchTasks(state: Status) {
    try {
        const res = await api.get(`/api/queue/${state}`).json<TableQueue[]>();
        return res;
    } catch (error) {
        pushError(error, "Fetch tasks");
        throw error;
    }
}

export async function retryTask(uid: number) {
    try {
        const res = await api.post("/api/queue/retry", { searchParams: { uid } }).json<number>();
        return res;
    } catch (error) {
        pushError(error, "Retry task");
        throw error;
    }
}