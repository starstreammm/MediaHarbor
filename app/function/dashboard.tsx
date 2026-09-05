export function formatBytes(mbytes: number) {
    if (mbytes === 0) return "0 MB";

    const k = 1024;
    const sizes = ["MB", "GB", "TB"];

    const i = Math.floor(Math.log(mbytes) / Math.log(k));
    const value = mbytes / Math.pow(k, i);

    return `${value.toFixed(1)}${sizes[i]}`;
}