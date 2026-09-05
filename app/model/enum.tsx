export const Layer = [
    "creators",
    "accounts",
    "posts",
    "collections",
    "files",
    "queue",
] as const;
export type Layer = typeof Layer[number];

export const Platform = [
    "douyin",
    "bilibili",
    "xhs",
    "ins",
    "x",
    "youtube",
] as const;
export type Platform = typeof Platform[number];

export const Status = [
    "pending",
    "running",
    "success",
    "error",
    "paused",
] as const;
export type Status = typeof Status[number];