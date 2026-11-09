import { Box, Dialog, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/CloseRounded";
import { useEffect, useState } from "react";
import type { TablePost } from "~/model/table";
import type { FileType } from "~/model/const";
import { getMediaType, FullPlayer } from "~/components/media";

export function PostView({ post, selectedFile, setSelectedFile, onClose, onNext, onLast, navigationFeedback, controlsVisible, setControlsVisible, onRateChange }: {
    post: TablePost;
    selectedFile: number;
    setSelectedFile: (index: number) => void;
    onClose: () => void;
    onNext?: () => boolean;
    onLast?: () => boolean;
    navigationFeedback?: string;
    controlsVisible: boolean;
    setControlsVisible: (visible: boolean) => void;
    onRateChange: (rate: number) => void;
}) {
    const [types, setTypes] = useState<FileType[]>([]);
    const [showNavigationFeedback, setShowNavigationFeedback] = useState(true);
    useEffect(() => {
        let cancelled = false;
        Promise.allSettled(post.files.map((file) => getMediaType(file as number))).then((results) => {
            if (!cancelled) setTypes(results.map((result) => result.status === "fulfilled" ? result.value : "unknown"));
        });
        return () => { cancelled = true; };
    }, [post.files]);
    const type = types[selectedFile];
    const uid = post.files[selectedFile] as number;

    return (
        <Dialog open fullScreen onClose={onClose} slotProps={{ paper: { sx: { bgcolor: "black", height: "100dvh" } } }}>
            {type === "image" || type === "video" ? <FullPlayer
                uid={uid}
                post={post}
                onRateChange={onRateChange}
                image={type === "image"}
                navigationFeedback={showNavigationFeedback ? navigationFeedback : undefined}
                controlsVisible={controlsVisible}
                setControlsVisible={setControlsVisible}
                navigation={{
                    fileIndex: selectedFile,
                    fileCount: post.files.length,
                    onClose,
                    onPost: (direction) => direction < 0 ? onLast?.() ?? false : onNext?.() ?? false,
                    onFile: (index) => {
                        setShowNavigationFeedback(false);
                        setSelectedFile(index);
                    },
                }}
            /> : <Box sx={{ display: "grid", placeItems: "center", height: "100%", color: "white" }}>
                <Typography>{!post.files.length ? "This post has no files." : !types.length ? "Loading media…" : "This media could not be loaded."}</Typography>
                <IconButton aria-label="Close preview" onClick={onClose} sx={{ position: "absolute", bottom: "max(12px, env(safe-area-inset-bottom))", right: 12, color: "white" }}><CloseIcon /></IconButton>
            </Box>}
        </Dialog>
    );
}
