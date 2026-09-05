import {
    LinearProgress,
    Tooltip,
    Box,
    Link,
    Dialog,
    DialogTitle,
    DialogContent,
    Typography,
    IconButton,
    TableRow,
    TableCell,
    useMediaQuery,
} from "@mui/material";
import { useColorScheme } from '@mui/material/styles';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Editor from "@monaco-editor/react";


import type {
    TableQueue,
    QueueDetailFile,
    QueueDetailPost,
    QueueDetailAccount,
    QueueDetailCollection,
    QueueDetailCreator,
    QueueDetailError,
    DownloadStatus,
} from "./model";
import type { Status } from "~/model/enum";
import { getDownloadStatus, fetchTasks, retryTask } from "../../function/task";
import { pushTaskSuccess } from "~/components/error_popout";


function ArrowTooltip({ children, title, top = true }: {
    children: React.ReactElement<unknown, any>;
    title: string | undefined;
    top?: boolean;
}) {
    return (
        <Tooltip
            title={title}
            arrow
            placement={top ? "top-start" : "bottom"}
            slotProps={{
                popper: {
                    modifiers: [
                        {
                            name: 'offset',
                            options: {
                                offset: [0, -14],
                            },
                        },
                    ],
                },
            }}
        >
            {children}
        </Tooltip>
    );
}

function StatusText({ status }: { status: Status }) {
    return (
        <TableCell sx={{
            color:
                status === "error"
                    ? "error.main"
                    : status === "success"
                        ? "success.main"
                        : status === "running"
                            ? "primary.main"
                            : undefined,
        }}>
            {status.toUpperCase()}
        </TableCell>
    );
}

function JsonViewer({ data, onClose, title = "JSON Viewer (Ready Only)" }: {
    data: Record<string, any>;
    onClose: () => void;
    title?: string;
}) {
    const { mode, setMode } = useColorScheme();
    const preferIsDark = useMediaQuery("(prefers-color-scheme: dark)");

    return (
        <Dialog open={true} fullWidth maxWidth={false} onClose={onClose}>
            <DialogTitle>
                <Box sx={{
                    display: "flex",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    width: "100%",
                }}>
                    <Typography variant="h6">
                        {title}
                    </Typography>
                    <IconButton onClick={onClose} sx={{ borderRadius: "18%" }}>
                        <CloseRoundedIcon />
                    </IconButton>
                </Box>
            </DialogTitle>
            <DialogContent>
                <Editor
                    height="80vh"
                    defaultLanguage="json"
                    value={JSON.stringify(data, null, 4)}
                    theme={mode === "dark" || (mode === "system" && preferIsDark) ? "vs-dark" : "vs"}
                    options={{
                        readOnly: true,
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                    }}
                />
            </DialogContent>
        </Dialog>
    );
}


function DetailFile({ detail }: { detail: QueueDetailFile }) {
    const name = detail.path.split('/').pop() ?? "Unknown";

    const { data: progress = {} as DownloadStatus } = useQuery({
        queryKey: ['download_status', detail.path, detail.gid],
        queryFn: () => getDownloadStatus(detail.gid),
        retry: 0,
        refetchInterval: (query) => {
            const status = query.state.data?.status;

            if (status === "success" || status === "error") {
                return false;
            }

            return 800;
        },
        refetchIntervalInBackground: true,
    });

    if (!progress)
        return null;

    return (
        <ArrowTooltip title={progress.msg}>
            <TableRow sx={{
                cursor: "pointer",
                "& > .MuiTableCell-root": {
                    borderTop: "none",
                    borderBottom: "none",
                },
                bgcolor: (theme) => theme.vars?.palette.background.paper
            }}>
                <TableCell sx={{ color: "secondary.main", whiteSpace: "nowrap" }}>File {detail.index}</TableCell>
                <StatusText status={progress.status ?? ""} />
                <TableCell sx={{ whiteSpace: "nowrap" }}>{name}</TableCell>
                <TableCell colSpan={2}>
                    <ArrowTooltip
                        title={`${progress.completed} of ${progress.total}`}
                        top={false}
                    >
                        <Box sx={{
                            display: "flex",
                            width: "100%",
                            flexDirection: "row",
                            gap: 1,
                            alignItems: "center",
                        }}>
                            <LinearProgress
                                variant={progress.status === "pending" ? "indeterminate" : "determinate"}
                                value={progress.progress}
                                sx={{ width: "100%", whiteSpace: "nowrap" }}
                            />
                            <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                                {progress.progress?.toFixed(1)}%
                            </Typography>
                        </Box>
                    </ArrowTooltip>
                </TableCell>
                <TableCell colSpan={2}>
                    <Box sx={{
                        display: "grid",
                        width: "100%",
                        gridTemplateColumns: "2fr 1fr 1fr",
                        alignItems: "center",
                    }}>
                        <Typography variant="body2">
                            {progress.speed}
                        </Typography>
                        <Typography variant="body2">
                            {progress.eta}
                        </Typography>
                    </Box>
                </TableCell>
            </TableRow>
        </ArrowTooltip >
    );
}

function DetailPost({ detail }: { detail: QueueDetailPost }) {
    const [open, setOpen] = useState(true);

    return (
        <>
            <ArrowTooltip title={detail.msg}>
                <TableRow
                    onClick={() => setOpen((prev) => !prev)}
                    sx={{
                        cursor: "pointer",
                        "& > .MuiTableCell-root": {
                            borderTop: "none",
                            borderBottom: "none",
                        },
                        bgcolor: (theme) => theme.vars?.palette.background.paper
                    }}
                >
                    <TableCell sx={{ color: "primary.main" }}>Post</TableCell>
                    <TableCell colSpan={4}>{detail.overview}</TableCell>
                    <TableCell>
                        <Link
                            sx={{ whiteSpace: "nowrap" }}
                            href={detail.url.startsWith("http") ? detail.url : `https://${detail.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Link
                        </Link>
                    </TableCell>
                    <TableCell>{open ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}</TableCell>
                </TableRow>
            </ArrowTooltip>
            {open && detail.files.map((file, index) =>
                <DetailFile key={index} detail={file} />
            )}
        </>
    );
}

function DetailAccount({ detail }: { detail: QueueDetailAccount }) {
    const [open, setOpen] = useState(true);

    return (
        <>
            <ArrowTooltip title={detail.msg}>
                <TableRow
                    onClick={() => setOpen((prev) => !prev)}
                    sx={{
                        cursor: "pointer",
                        "& > .MuiTableCell-root": {
                            borderTop: "none",
                            borderBottom: "none",
                        },
                        bgcolor: (theme) => theme.vars?.palette.background.paper
                    }}
                >
                    <TableCell sx={{ color: "primary.main" }}>Account</TableCell>
                    <TableCell colSpan={4}>{detail.alias}</TableCell>
                    <TableCell>
                        <Link
                            sx={{ whiteSpace: "nowrap" }}
                            href={detail.url.startsWith("http") ? detail.url : `https://${detail.url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Link
                        </Link>
                    </TableCell>
                    <TableCell>{open ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}</TableCell>
                </TableRow>
            </ArrowTooltip>
            {open && detail.posts.map((post, index) =>
                <DetailPost key={index} detail={post} />
            )}
        </>
    );
}

function DetailCollection({ detail }: { detail: QueueDetailCollection }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <ArrowTooltip title={detail.msg}>
                <TableRow
                    onClick={() => setOpen((prev) => !prev)}
                    sx={{
                        cursor: "pointer",
                        "& > .MuiTableCell-root": {
                            borderTop: "none",
                            borderBottom: "none",
                        },
                        bgcolor: (theme) => theme.vars?.palette.background.paper
                    }}
                >
                    <TableCell sx={{ color: "primary.main" }}>
                        Collection
                    </TableCell>
                    <TableCell colSpan={5}>
                        {detail.alias}
                    </TableCell>
                    <TableCell>{open ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}</TableCell>
                </TableRow>
            </ArrowTooltip>
            {open && detail.posts.map((item, index) =>
                <DetailPost key={index} detail={item} />
            )}
        </>
    );
}

function DetailCreator({ detail }: { detail: QueueDetailCreator }) {
    const [open, setOpen] = useState(true);

    return (
        <>
            <ArrowTooltip title={detail.msg}>
                <TableRow
                    onClick={() => setOpen((prev) => !prev)}
                    sx={{
                        cursor: "pointer",
                        "& > .MuiTableCell-root": {
                            borderTop: "none",
                            borderBottom: "none",
                        },
                        bgcolor: (theme) => theme.vars?.palette.background.paper
                    }}
                >
                    <TableCell sx={{ color: "primary.main" }}>Creator</TableCell>
                    <TableCell colSpan={5}>{detail.alias}</TableCell>
                    <TableCell>{open ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}</TableCell>
                </TableRow>
            </ArrowTooltip>
            {open && detail.accounts.map((item, index) =>
                <DetailAccount key={index} detail={item} />
            )}
        </>
    );
}

export function DetailError({ uid, detail, refetch }: { uid: number; detail: QueueDetailError; refetch: () => void }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            {open && <JsonViewer data={detail.progress} onClose={() => setOpen(false)} title="Error Details (Read Only)" />}
            <TableRow
                onClick={() => setOpen((prev) => !prev)}
                sx={{
                    cursor: "pointer",
                    "& > .MuiTableCell-root": {
                        borderTop: "none",
                        borderBottom: "none",
                    },
                    bgcolor: (theme) => theme.vars?.palette.background.paper
                }}
            >
                <StatusText status="error" />
                <TableCell colSpan={4}>
                    {detail.msg}
                </TableCell>
                <TableCell>
                    <Link
                        sx={{ whiteSpace: "nowrap" }}
                        onClick={() =>
                            retryTask(uid)
                                .then((res) => {
                                    pushTaskSuccess(`Task ${uid} retried successfully. New task UID: ${res}.`);
                                    refetch();
                                })
                        }
                    >
                        Retry
                    </Link>
                </TableCell>
                <TableCell>{open ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}</TableCell>
            </TableRow>
        </>
    );
}

function DetailCore({ detail, refetch }: { detail: TableQueue; refetch: () => void }) {
    const [openJob, setOpenJob] = useState(false);
    const [openDetail, setOpenDetail] = useState(false);

    function DetailComponent() {
        if (detail.detail === null) {
            return (
                <TableRow>
                    <TableCell colSpan={7}>
                        No detail available
                    </TableCell>
                </TableRow>
            );
        }
        if (detail.detail.type === "file") {
            return <DetailFile detail={detail.detail} />;
        }
        else if (detail.detail.type === "post") {
            return <DetailPost detail={detail.detail} />;
        }
        else if (detail.detail.type === "account") {
            return <DetailAccount detail={detail.detail} />;
        }
        else if (detail.detail.type === "collection") {
            return <DetailCollection detail={detail.detail} />;
        }
        else if (detail.detail.type === "creator") {
            return <DetailCreator detail={detail.detail} />;
        }
        else {
            return <DetailError uid={detail.uid} detail={detail.detail} refetch={refetch} />;
        }
    }

    return (
        <>
            {openJob && <JsonViewer data={detail} onClose={() => setOpenJob(false)} title="Task Details (Read Only)" />}
            <TableRow onClick={() => setOpenDetail((prev) => !prev)} sx={{ cursor: "pointer" }}>
                <TableCell>{detail.uid}</TableCell>
                <StatusText status={detail.status} />
                <TableCell sx={{ whiteSpace: "nowrap" }}>{detail.alias}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{new Date(detail.scheduled).toLocaleString()}</TableCell>
                <TableCell sx={{ whiteSpace: "nowrap" }}>{new Date(detail.create_time).toLocaleString()}</TableCell>
                <TableCell>
                    <Link
                        sx={{ whiteSpace: "nowrap" }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setOpenJob(true);
                        }}
                    >
                        Json Viewer
                    </Link>
                </TableCell>
                <TableCell>{openDetail ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}</TableCell>
            </TableRow>
            {openDetail &&
                <DetailComponent />
            }
        </>
    )
}

export function StatusCore({ state }: { state: Status }) {
    const { data: tasks = [], refetch } = useQuery({
        queryKey: ['task_state', state],
        queryFn: () => fetchTasks(state),
        retry: 0,
        refetchInterval: 1888,
        refetchIntervalInBackground: true,
    });

    return (
        <>
            {tasks.map((task, index) =>
                <DetailCore detail={task} key={index} refetch={refetch} />
            )}
        </>
    );
}