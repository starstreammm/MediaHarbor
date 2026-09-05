import { Button } from "@mui/material";
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';

import axios from "axios";
import { api } from "~/hooks/api";

import { pushError } from "~/components/error_popout";

export const PHOTO_SUFFIXES = [".jpg", ".jpeg", ".png", ".webp"];
export const VIDEO_SUFFIXES = [".mp4"];


function uploadFile(
    file: File,
    onProgress: (percent: number) => void,
    signal?: AbortSignal
) {
    const formData = new FormData();
    formData.append("file", file);

    return axios.post<string>("/api/file/upload", formData, {
        signal,

        headers: {
            "Content-Type": "multipart/form-data",
        },

        onUploadProgress: (event) => {
            if (!event.total) return;

            const percent = Math.round(
                (event.loaded * 100) / event.total
            );

            onProgress(percent);
        },
    });
}


async function insertFiles(
    list: FileList,
    onStart: (file: File, controller: AbortController) => void,
    onProgress: (file: File, percent: number) => void,
    onEnd: (file: File, uid?: number) => void
) {
    for (const file of list) {
        const controller = new AbortController();
        onStart(file, controller);
        try {
            const res = await uploadFile(file, (percent) => {
                onProgress(file, percent);
            }, controller.signal);
            onEnd(file, Number(res.data));
        }
        catch (e) {
            pushError(e, `Failed to upload file: ${file.name}`);
            onEnd(file, -1);
        }
    }
}

export async function deleteFile(uid: number) {
    try {
        await api.post("/api/file/delete", { searchParams: { uid } })
    } catch (e) {
        pushError(e, `Failed to delete file: ${uid}`);
        throw e;
    }
}

export function formatFileSize(size: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];

    let i = 0;
    let value = size;

    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
    }

    const digits = value >= 100 || i === 0 ? 0 : 1;

    return `${value.toFixed(digits)} ${units[i]}`;
}

export function FileInput({
    multi = false,
    type,
    onStart = () => { },
    onProgress = () => { },
    onEnd = () => { }
}: {
    multi?: boolean,
    type?: "photo" | "video",
    onStart?: (file: File, controller: AbortController) => void,
    onProgress?: (file: File, percent: number) => void,
    onEnd?: (file: File, uid?: number) => void
}) {
    return (
        <input
            type="file"
            onChange={(event) => insertFiles(
                event.target.files!,
                onStart,
                onProgress,
                onEnd,
            )}
            multiple={multi}
            accept={
                type === "photo"
                    ? PHOTO_SUFFIXES.join(",")
                    : type === "video"
                        ? VIDEO_SUFFIXES.join(",")
                        : [...PHOTO_SUFFIXES, ...VIDEO_SUFFIXES].join(",")
            }
            style={{
                clip: 'rect(0 0 0 0)',
                clipPath: 'inset(50%)',
                height: 1,
                overflow: 'hidden',
                position: 'absolute',
                bottom: 0,
                left: 0,
                whiteSpace: 'nowrap',
                width: 1,
            }}
        />
    );
}


export function FileInputButton({
    multi = false,
    type,
    onStart = () => { },
    onProgress = () => { },
    onEnd = () => { }
}: {
    multi?: boolean,
    type?: "photo" | "video",
    onStart?: (file: File, controller: AbortController) => void,
    onProgress?: (file: File, percent: number) => void,
    onEnd?: (file: File, uid?: number) => void
}) {
    return (
        <Button
            component="label"
            role={undefined}
            variant="contained"
            startIcon={<CloudUploadRoundedIcon />}
            onClick={(e) => {
                e.stopPropagation();
            }}
        >
            Upload File
            <FileInput
                multi={multi}
                type={type}
                onStart={onStart}
                onProgress={onProgress}
                onEnd={onEnd}
            />
        </Button>
    );
}


export async function downloadFile(uid: number) {
    try {
        const res = await api.get(`/api/file/download/${uid}`);
        const url = URL.createObjectURL(await res.blob());

        const a = document.createElement("a");
        a.href = url;
        a.download = res.headers.get("X-Content-Filename") ?? "UID_" + uid;
        a.click();

        URL.revokeObjectURL(url);
    }
    catch (e) {
        pushError(e, `Download file ${uid}`);
        throw e;
    }
}