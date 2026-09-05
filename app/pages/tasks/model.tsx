import type { Status } from "~/model/enum";

export interface QueueItemBase {
    msg: string;
}

export interface QueueDetailFile extends QueueItemBase {
    type: "file";
    index: number;
    path: string;
    gid?: string;
}

export interface QueueDetailPost extends QueueItemBase {
    type: "post";
    overview: string;
    url: string;
    files: QueueDetailFile[];
}

export interface QueueDetailAccount extends QueueItemBase {
    type: "account";
    alias: string;
    url: string;
    posts: QueueDetailPost[];
}

export interface QueueDetailCollection extends QueueItemBase {
    type: "collection";
    alias: string;
    posts: QueueDetailPost[];
}

export interface QueueDetailCreator extends QueueItemBase {
    type: "creator";
    alias: string;
    accounts: QueueDetailAccount[];
}

export interface QueueDetailError extends QueueItemBase {
    type: "error";
    progress: Record<string, any>;
}

export interface QueueInsert {
    alias: string;
    job: Record<string, any>;
    scheduled: string;
}

export interface TableQueue extends QueueInsert {
    uid: number;
    create_time: string;
    status: Status;
    detail: QueueDetailFile | QueueDetailPost | QueueDetailAccount | QueueDetailCollection | QueueDetailCreator | QueueDetailError | null;
}

export interface DownloadStatus {
    path: string;
    status: Status;
    speed: string;
    progress: number;
    total: string;
    completed: string;
    eta: string;
    msg?: string;
}