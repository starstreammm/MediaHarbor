import { Alert, Box, Backdrop, type SxProps, type Theme } from "@mui/material";
import {
    MediaPlayer,
    MediaProvider,
    isHLSProvider,
    type MediaPlayerInstance,
    type MediaPlayerProps,
} from "@vidstack/react";
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
export { FullPlayer } from "./player/player";

import { useEffect, useRef, useState } from "react";
import { useFileInfo } from "~/hooks/file-info";
import { useMediaRetry } from "./player/use-media-retry";

import type { FileType } from "~/model/const";
import { pushError } from "~/components/error_popout";
import { api } from "~/hooks/api";


export async function getMediaType(uid: number): Promise<FileType> {
    try {
        const res = await api.get(`/api/file/type/${uid}`).json<"image" | "video">();
        return res;
    }
    catch (error) {
        pushError(error, "Failed to get media");
        throw error;
    }
}

export async function getFirstImageUid(uids: number[]) {
    for (const uid of uids) {
        try {
            const type = await getMediaType(uid);
            if (type === "image") {
                return uid;
            }
        }
        catch { }
    }
    return null;
}

export function ImageBox({ uid, sx, onClick, hover }: {
    uid: number;
    sx?: SxProps<Theme>;
    onClick?: () => void;
    hover?: boolean;
}) {
    const info = useFileInfo(uid);
    if (info.data?.exist === false) return <Alert severity="warning" onClick={onClick}>File missing from storage.</Alert>;
    return (
        <Box
            component="img"
            src={`/api/file/${uid}`}
            onClick={onClick}
            sx={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                cursor: onClick ? "pointer" : "default",
                transition: hover ? "transform 150ms ease" : undefined,
                ...(hover && {
                    "&:hover": {
                        transform: "scale(1.03)",
                    },
                }),
                ...sx,
            }}
        />
    )
}

export function ImageViewer({ uid, sx, full = false }: { uid: number; sx?: SxProps<Theme>; full?: boolean }) {
    const [open, setOpen] = useState(full);

    if (open) {
        return (
            <Backdrop
                open
                onClick={() => setOpen(false)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.stopPropagation();
                        setOpen(false);
                    }
                }}
                transitionDuration={300}
                sx={{
                    zIndex: (theme) => theme.zIndex.drawer + 1,
                    backgroundColor: "rgba(0, 0, 0, 0.78)",
                    backdropFilter: "blur(4px)",
                }}>
                <ImageBox uid={uid} sx={{ width: "100%", height: "100%", ...sx }} onClick={() => setOpen(true)} />
            </Backdrop>
        );
    }
    else {
        return (
            <ImageBox uid={uid} sx={sx} onClick={() => setOpen(true)} />
        );
    }
}

export function HoverPlayer({ uid, sx }: { uid: number; sx?: MediaPlayerProps["style"] }) {
    const info = useFileInfo(uid);
    const player = useRef<MediaPlayerInstance>(null);
    const [activated, setActivated] = useState(false);
    const [hovered, setHovered] = useState(false);
    const recovery = useMediaRetry(uid, hovered);
    const [playbackError, setPlaybackError] = useState<string | null>(null);
    const rewindTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (rewindTimer.current) clearTimeout(rewindTimer.current);
    }, []);

    const play = () => {
        if (!hovered) return;
        void player.current?.play().catch((error: Error) => {
            // Leaving the card or replacing a failed source aborts pending playback.
            if (error.name !== "AbortError") setPlaybackError(error.message);
        });
    };

    useEffect(() => {
        if (hovered && player.current?.state.canPlay) play();
    }, [hovered]);

    const handleMouseEnter = () => {
        if (rewindTimer.current) clearTimeout(rewindTimer.current);
        setPlaybackError(null);
        setHovered(true);
        setActivated(true);
        if (recovery.error && !recovery.retrying) recovery.retry();
    };

    const handleMouseLeave = () => {
        setHovered(false);
        void player.current?.pause().catch((error: Error) => setPlaybackError(error.message));
        rewindTimer.current = setTimeout(() => {
            if (player.current)
                player.current.currentTime = 0;
        }, 333);
    };


    if (info.data?.exist === false) return <Alert severity="warning">File missing from storage.</Alert>;

    return (
        <Box
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            sx={{
                position: "relative",
                width: "100%",
                height: "100%",
                minWidth: 0,
                minHeight: 0,

                bgcolor: "black",

                // 不允许内容影响外部布局
                overflow: "visible",

                // 防止放大后被其它内容盖住
                zIndex: hovered ? 10 : 0,
            }}
        >
            {activated && (
                <Box
                    sx={{
                        position: "absolute",
                        inset: 0,

                        width: "100%",
                        height: "100%",

                        bgcolor: "black",
                        overflow: "hidden",

                        transform: hovered
                            ? "scale(1.08)"
                            : "scale(1)",

                        transformOrigin: "center",

                        transition:
                            "transform 333ms ease, box-shadow 333ms ease",

                        boxShadow: hovered
                            ? 6
                            : 0,

                        "& [data-media-provider]": {
                            width: "100%",
                            height: "100%",
                        },

                        "& [data-media-provider] video": {
                            display: "block",

                            width: "100%",
                            height: "100%",

                            maxWidth: "100%",
                            maxHeight: "100%",

                            objectFit: "contain",
                        },
                    }}
                >
                    <MediaPlayer
                        key={`${uid}:${recovery.attempt}`}
                        ref={player}
                        src={{
                            src: `/api/file/${uid}`,
                            type: "application/x-mpegurl",
                        }}
                        style={{
                            width: "100%",
                            height: "100%",
                            maxWidth: "100%",
                            maxHeight: "100%",
                            ...sx,
                        }}
                        onProviderChange={(provider) => {
                            if (isHLSProvider(provider)) provider.library = () => import("hls.js");
                        }}
                        onError={recovery.onError}
                        onCanPlay={play}
                        onPlaying={() => {
                            recovery.onPlaying();
                            setPlaybackError(null);
                            if (!hovered) void player.current?.pause().catch((error: Error) => setPlaybackError(error.message));
                        }}
                        load="eager"
                        playsInline
                        muted
                    >
                        <MediaProvider
                            style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "contain",
                            }}
                        />
                    </MediaPlayer>
                    {hovered && (recovery.error || playbackError) && <Box
                        role="status"
                        sx={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", gap: 1, p: 2, color: "white", bgcolor: "rgba(0, 0, 0, 0.7)", textAlign: "center" }}
                    >
                        {recovery.retrying ? "Preparing video… Retrying" : <>
                            <span>{recovery.error?.message ?? playbackError}</span>
                            <button onClick={(event) => {
                                event.stopPropagation();
                                setPlaybackError(null);
                                recovery.retry();
                            }}>Retry</button>
                        </>}
                    </Box>}
                </Box>
            )}
        </Box>
    );
}
