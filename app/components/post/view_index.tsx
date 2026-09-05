import { Box, Fab, Paper, Dialog, Tabs, Tab, Typography, Divider } from "@mui/material";
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import KeyboardArrowLeftRoundedIcon from '@mui/icons-material/KeyboardArrowLeftRounded';
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded';

import { useEffect, useState } from "react";

import type { TablePost } from "~/model/table";
import type { FileType } from "~/model/const";
import PostRating from "~/components/post/rating";
import { getMediaType, ImageViewer, FullPlayer } from "~/components/media";

export function PostView({ post, setPost, onClose, onNext, onLast }: {
    post: TablePost;
    setPost: (newPost: TablePost) => void;
    onClose: () => void;
    onNext?: () => void;
    onLast?: () => void;
}) {
    const [types, setTypes] = useState<FileType[]>([]);
    const [selectedFile, setSelectedFile] = useState<number>(0);
    const [showArrow, setShowArrow] = useState<boolean>(false);

    useEffect(() => {
        Promise.allSettled(post.files.map((file) => getMediaType(file as number)))
            .then((res) => setTypes(res.map((r) => (r.status === "fulfilled" ? r.value : "unknown"))))
    }, [, post]);

    return (
        <Dialog
            open
            fullScreen
            onClose={onClose}
            onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "ArrowLeft" || e.key === "a" || e.key === "j") {
                    setSelectedFile((prev) => Math.max(prev - 1, 0));
                }
                if (e.key === "ArrowRight" || e.key === "d" || e.key === "l") {
                    setSelectedFile((prev) => Math.min(prev + 1, post.files.length - 1));
                }
                if (e.key === "ArrowUp" || e.key === "w" || e.key === "p") {
                    onLast?.();
                }
                if (e.key === "ArrowDown" || e.key === "s" || e.key === "n") {
                    onNext?.();
                }
            }}
        >
            <Fab
                onClick={onClose}
                sx={{
                    position: "absolute",
                    bottom: { xs: 8, md: 16 },
                    right: { xs: 8, md: 16 },
                }}
            >
                <CloseRoundedIcon />
            </Fab>
            <Box
                sx={{
                    width: "100%",
                    height: "100%",

                    display: "flex",
                    overflow: "hidden",
                    gap: 1,

                    /* Portrait */
                    flexDirection: "column",

                    /* Landscape */
                    "@media (orientation: landscape)": {
                        flexDirection: "row",
                    },
                }}
            >
                {/* LEFT: MEDIA + FILE PICKER */}
                <Box
                    sx={{
                        display: "flex",
                        width: "100%",
                        height: "100%",
                        flexDirection: "column",
                    }}
                >
                    {/* MEDIA */}
                    <Box
                        sx={{
                            /* 没有 File Picker 时：Media 吃掉全部空间
                             * 有 File Picker 时：Media 吃掉剩余空间 */
                            display: "flex",
                            position: "relative",
                            width: "100%",
                            height: "100%",
                            bgcolor: "black",
                            overflow: "hidden",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        {types[selectedFile] === "image"
                            ? <ImageViewer uid={post.files[selectedFile] as number} />
                            : types[selectedFile] === "video"
                                ? <FullPlayer uid={post.files[selectedFile] as number} />
                                : <Typography variant="h3" sx={{ color: "white" }}>Unknown Media Type</Typography>
                        }
                        {post.files.length > 1 &&
                            <>
                                <Fab
                                    color="primary"
                                    onClick={() => setSelectedFile((prev) => prev - 1)}
                                    onMouseEnter={() => setShowArrow(true)}
                                    onMouseLeave={() => setShowArrow(false)}
                                    disabled={selectedFile === 0}
                                    sx={{
                                        opacity: showArrow ? 1 : 0,
                                        position: "absolute",
                                        left: "3%",
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        transition: "opacity 0.2s ease",
                                    }}>
                                    <KeyboardArrowLeftRoundedIcon />
                                </Fab>
                                <Fab
                                    color="primary"
                                    onClick={() => setSelectedFile((prev) => prev + 1)}
                                    onMouseEnter={() => setShowArrow(true)}
                                    onMouseLeave={() => setShowArrow(false)}
                                    disabled={selectedFile === post.files.length - 1}
                                    sx={{
                                        opacity: showArrow ? 1 : 0,
                                        position: "absolute",
                                        right: "3%",
                                        top: "50%",
                                        transition: "opacity 0.3s ease",
                                        transform: "translateY(-50%)",
                                    }}>
                                    <KeyboardArrowRightRoundedIcon />
                                </Fab>
                            </>
                        }
                    </Box>

                    {/* FILE PICKER: ONLY show when there are multiple files */}
                    {post.files.length > 1 &&
                        <Paper
                            elevation={3}
                            sx={{
                                height: 33,
                                width: "100%",

                                display: "flex",
                                position: "relative",
                                flexDirection: "column",
                                overflow: "hidden",
                                borderRadius: 0,
                            }}
                        >
                            <Tabs
                                value={selectedFile}
                                onChange={(_, newValue) => setSelectedFile(newValue)}
                                variant="scrollable"
                                scrollButtons
                                allowScrollButtonsMobile
                                sx={{
                                    minHeight: 33,
                                    height: 33,
                                    py: 0,

                                    "& .MuiTab-root": {
                                        minHeight: 33,
                                        height: 33,
                                        py: 0,
                                    },
                                }}
                            >
                                {types.map((type, index) =>
                                    <Tab
                                        key={post.files[index] as number}
                                        value={index}
                                        label={
                                            type === "unknown"
                                                ? "Unknown"
                                                : `${type === "image" ? "Image" : "Video"} ${index + 1}`
                                        }
                                        onClick={() => setSelectedFile(index)}
                                    />
                                )}
                            </Tabs>
                        </Paper>
                    }
                </Box>

                {/* RIGHT: INFO */}
                <Paper
                    elevation={13}
                    sx={{
                        /* Portrait */
                        width: "100%",
                        height: 188,

                        /* Landscape */
                        "@media (orientation: landscape)": {
                            width: 233,
                            height: "100%",
                        },

                        display: "flex",
                        flexDirection: "column",
                        overflow: "auto",
                        bgcolor: (theme) => theme.vars?.palette.background.default,
                        p: 1,
                        gap: 1,
                    }}
                >
                    <Typography variant="h5">
                        Information
                    </Typography>
                    <Divider />
                    {([
                        ["UID", post.uid],
                        ["Platform", post.platform?.toUpperCase()],
                        ["PID", post.pid],
                        ["Overview", post.overview],
                        ["Post Time", new Date(post.post_time).toLocaleString()],
                        ["Create Time", new Date(post.create_time).toLocaleString()],
                        ["Account PID", post.account_pid],
                    ] as [string, string | undefined][]).map(([label, value]) =>
                        <Typography variant="body1" sx={{ overflowWrap: "anywhere", wordBreak: label.includes("Time") ? "break-word" : "break-all" }} key={label}>
                            <b>{label}: </b>{value ?? "N/A"}
                        </Typography>
                    )}
                    <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                        Rate:
                    </Typography>
                    <PostRating
                        uid={post.uid}
                        rate={post.rate}
                        onChange={(newValue) => setPost({ ...post, rate: newValue })}
                    />
                </Paper>
            </Box>
        </Dialog >
    );
}