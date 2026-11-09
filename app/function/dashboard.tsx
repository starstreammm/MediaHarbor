import type { Platform } from "~/model/enum";
import type { TableStatistics } from "~/model/status";


export const platformLabels: Record<Platform, string> = {
    douyin: "Douyin",
    tiktok: "TikTok",
    bilibili: "Bilibili",
    xhs: "XHS",
    ins: "Instagram",
    x: "X",
    youtube: "YouTube",
};

export function postCount(day: TableStatistics, platform: Platform): number {
    return day.post_counts?.[platform] ?? day[`post_len_${platform}`] ?? 0;
}

export function formatBytes(mbytes: number) {
    if (mbytes === 0) return "0 MB";

    const k = 1024;
    const sizes = ["MB", "GB", "TB"];

    const i = Math.floor(Math.log(mbytes) / Math.log(k));
    const value = mbytes / Math.pow(k, i);

    return `${value.toFixed(1)}${sizes[i]}`;
}
