export interface ModelHealthStatus {
    database: boolean | null;
    settings: boolean | null;
    logger: boolean | null;
    statistic: boolean | null;
    aria2: boolean | null;
    delete: boolean | null;
    queue: boolean | null;
    apis?: boolean;
    base?: boolean;
}

export interface ApiHealthStatus {
    douyin: boolean | null;
    bilibili: boolean | null;
    xhs: boolean | null;
    x: boolean | null;
    ins: boolean | null;
    youtube: boolean | null;
}

export interface DatabaseConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
}

export interface TableStatistics {
    post_len_douyin: number;
    post_len_bilibili: number;
    post_len_xhs: number;
    post_len_x: number;
    post_len_ins: number;
    post_len_youtube: number;
    file_len_video: number;
    file_len_photo: number;
    file_size_video: number;
    file_size_photo: number;
    date: string;
}

export interface ApiDeviceStatistics {
    os: string;
    cpu: string;
    memory: string;
    queue_running: number;
    queue_pending: number;
    queue_error: number;
    queue_success: number;
    uptime: string; // ISO datetime string
    version: string;
}