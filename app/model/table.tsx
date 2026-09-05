import type { AccountFilter } from "./cursor";
import type { Platform } from "./enum";

export interface TableSettings {
    data_path: string;
    aria2_path: string;

    aria2_host: string;
    aria2_port: number;
    aria2_secret: string;

    cookie_douyin: string;
    cookie_douyin_date: string;

    cookie_bilibili: string;
    cookie_bilibili_date: string;

    cookie_xhs: string;
    cookie_xhs_date: string;

    cookie_x: string;
    cookie_x_date: string;

    cookie_ins: string;
    cookie_ins_date: string;

    cookie_youtube: string;
    cookie_youtube_date: string;

    log_level: string;
}


export interface TableProfileHistory {
    uid: number;
    key: string;
    value: string;
    last_seen: string; // ISO datetime string
}

export interface TableCollection {
    uid: number;
    alias: string;
    notes?: string;
    posts: number[];
    create_time: string; // ISO datetime string
}

export interface DetailsPost {
    platform?: Platform;
    account_pid?: string;
    pid?: string;
    url?: string;
    overview: string;
    post_time: string; // ISO datetime string
    files: number[] | Record<string, unknown>[];
}

export interface TablePost extends DetailsPost {
    uid: number;
    rate: number;
    account_uid?: number;
    create_time: string; // ISO datetime string
}

export interface DetailsCreator {
    alias: string;
    overview: string;
    rate: number;
}

export interface TableCreator extends DetailsCreator {
    uid: number;
    avatar: number;
    create_time: string; // ISO datetime string
}

export interface DetailsAccount {
    platform?: Platform;
    pid?: string;
    url?: string;
    alias: string;
    overview: string;
    avatar?: number | null;
    cover?: number | null;
    age?: number | null;
    gender?: boolean | null; // true male; false female
    ip?: string | null;
    address?: string | null;
    school?: string | null;
}


export interface TableAccount extends DetailsAccount {
    uid: number;
    filter?: AccountFilter
    latest_update: string | null; // ISO datetime string
    sync_task: number | null;
    sync_status: boolean;
    create_time: string; // ISO datetime string
}