import {
    Box,
    TextField,
    Tooltip,
    Table,
    TableBody,
    TableCell,
    TableRow,
    IconButton,
    Typography,
    LinearProgress,
    Rating,
    Autocomplete,
    useMediaQuery,
} from "@mui/material";
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';

import dayjs from 'dayjs';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

import { DragDropProvider } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';

import {
    useState,
    forwardRef,
    useImperativeHandle,
    type ForwardedRef,
} from "react";

import type { ApiPostInsert, InsertRef } from "~/model/api";
import { Platform } from "~/model/enum";
import { urlRegex } from "~/model/const";
import { FileInputButton, formatFileSize } from "~/hooks/file";
import { insertSubmit } from "~/function/post";
import { pushError } from "../error_popout";

interface UploadFile {
    uid?: number;
    file: File;
    progress: number;
    controller: AbortController;
}

export default forwardRef(ManualInsert);

function ManualInsert(
    {
        open,
        defaultValue = {} as ApiPostInsert,
    }: {
        open: boolean;
        defaultValue?: ApiPostInsert;
    },
    ref: ForwardedRef<InsertRef<ApiPostInsert, number>>,
) {
    if (!open) return null;

    const isUpLg = useMediaQuery((theme) => theme.breakpoints.up('lg'), { noSsr: true });
    const isUpMd = useMediaQuery((theme) => theme.breakpoints.up('md'), { noSsr: true });
    const [insert, setInsert] = useState<ApiPostInsert>(defaultValue);
    const [upload, setUpload] = useState<UploadFile[]>([]);


    useImperativeHandle(ref, () => ({
        resData() {
            if (insert.overview && insert.files?.length > 0) {
                return {
                    ...insert,
                    files: upload
                        .filter((f) => f.uid && f.uid >= 0)
                        .map((f) => f.uid!) as number[],
                };
            }
            else {
                pushError("Please fill in the required fields.");
                throw new Error("Invalid data");
            }
        },
        submit() {
            if (insert.overview && insert.files?.length > 0) {
                const data = {
                    ...insert,
                    files: upload
                        .filter((f) => f.uid && f.uid >= 0)
                        .map((f) => f.uid!) as number[],
                };
                return insertSubmit(data);
            }
            else {
                pushError("Please fill in the required fields.");
                throw new Error("Invalid data");
            }
        },
    }));


    function SortableFileItem({ file, index }: { file: UploadFile; index: number }) {
        const { ref, handleRef } = useSortable({ id: `${file.file.name}${file.file.lastModified}`, index });

        function State({ text = true }: { text?: boolean }) {
            if (file.uid === undefined)
                return (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <LinearProgress variant="determinate" value={file.progress} color="primary" sx={{ width: "100%" }} />
                        <Typography variant="body2" sx={{ color: "primary.main", width: 133, whiteSpace: "nowrap", display: text ? "block" : "none" }}>
                            {file.progress}% - Uploading
                        </Typography>
                    </Box>
                );
            else if (file.uid >= 0)
                return (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <LinearProgress variant="determinate" value={100} color="success" sx={{ width: "100%" }} />
                        <Typography variant="body2" sx={{ color: "success.main", width: 133, whiteSpace: "nowrap", display: text ? "block" : "none" }}>
                            100% - Uploaded
                        </Typography>
                    </Box>
                );
            else
                return (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <LinearProgress color="error" sx={{ width: "100%" }} />
                        <Typography variant="body2" sx={{ color: "error.main", width: 133, whiteSpace: "nowrap", display: text ? "block" : "none" }}>
                            Upload Failed
                        </Typography>
                    </Box>
                );
        }

        function Prefix() {
            return (
                <>
                    <TableCell>
                        <IconButton size="small" onClick={() => setUpload((prev) => prev.filter((f) => f.file !== file.file))}>
                            <CloseRoundedIcon fontSize="small" color="error" />
                        </IconButton>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }} ref={handleRef}>
                        <Tooltip title="Drag to reorder" placement="top" arrow>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <UploadFileRoundedIcon color="primary" />
                                <Typography variant="body1" color="primary">
                                    File {index + 1}
                                </Typography>
                            </Box>
                        </Tooltip>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <Typography variant="body1">
                            {file.file.name}
                        </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <Typography variant="body1">
                            {formatFileSize(file.file.size)}
                        </Typography>
                    </TableCell>
                </>
            );
        }

        if (isUpLg)
            return (
                <TableRow ref={ref}>
                    <Prefix />
                    <TableCell sx={{ width: "100%" }}>
                        <State />
                    </TableCell>
                </TableRow>
            );
        else
            return (
                <div ref={ref}>
                    <TableRow>
                        <Prefix />
                        <TableCell sx={{ width: "100%" }} />
                    </TableRow>
                    <TableRow>
                        <TableCell colSpan={5}>
                            <State text={isUpMd} />
                        </TableCell>
                    </TableRow>
                </div>
            );
    }

    return (
        <>
            <Box sx={{
                display: "flex",
                justifyContent: "flex-start",
                alignItems: "center",
                gap: { xs: 1, md: 3 },
            }}>
                <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                    Files
                </Typography>
                <FileInputButton
                    multi
                    onStart={(f, c) => setUpload((prev) => [...prev, { file: f, progress: 0, controller: c }])}
                    onProgress={(f, p) => setUpload((prev) =>
                        prev.map((file) =>
                            file.file === f ? { ...file, progress: p } : file
                        )
                    )}
                    onEnd={(f, uid) => setUpload((prev) =>
                        prev.map((file) =>
                            file.file === f ? { ...file, uid: uid ?? -1 } : file
                        )
                    )}
                />
            </Box>
            <Table size="small" sx={{
                width: "100%",
                borderCollapse: "collapse",
                "& .MuiTableCell-root": {
                    borderBottom: "none",
                },
            }}>
                <TableBody>
                    <DragDropProvider onDragEnd={(event) => { setUpload((items) => move(items as any, event)) }}>
                        {upload.map((file, index) => (
                            <SortableFileItem key={`${file.file.name}${file.file.lastModified}`} file={file} index={index} />
                        ))}
                    </DragDropProvider>
                </TableBody>
            </Table >
            <Typography variant="h6" sx={{ fontWeight: "bold", mt: { xs: 1, md: 3 } }}>
                Required Information
            </Typography>
            <TextField
                required
                label="Overview"
                fullWidth
                multiline
                error={insert?.overview === ""}
                value={insert?.overview}
                onChange={(e) => setInsert((prev) => ({ ...prev, overview: e.target.value }))}
            />
            <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DateTimePicker
                    label="Post Date"
                    value={insert?.post_time ? dayjs(insert.post_time) : dayjs()}
                    onChange={(newValue) => setInsert((prev) => ({ ...prev, post_time: newValue ? newValue.toISOString() : "" }))}
                />
            </LocalizationProvider>
            <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, md: 3 } }}>
                <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
                    Rate
                </Typography>
                <Rating
                    size="large"
                    name="post-rating"
                    value={insert?.rate || 0}
                    onChange={(_, newValue) => setInsert((prev) => ({ ...prev, rate: newValue || 0 }))}
                />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: "bold", mt: { xs: 1, md: 3 } }}>
                Additional Information
            </Typography>
            <Autocomplete
                sx={{ maxWidth: 288 }}
                options={Platform}
                value={insert?.platform}
                onChange={(_, newValue) => setInsert((prev) => ({ ...prev, platform: newValue ?? undefined }))}
                renderInput={(params) => <TextField {...params} label="Platform" />}
            />
            <TextField
                label="pid"
                fullWidth
                value={insert?.pid}
                onChange={(e) => setInsert((prev) => ({ ...prev, pid: e.target.value }))}
            />
            <TextField
                label="url"
                fullWidth
                error={insert?.url ? insert.url.match(urlRegex) === null : false}
                value={insert?.url}
                onChange={(e) => setInsert((prev) => ({ ...prev, url: e.target.value }))}
            />
            <TextField
                label="Account UID"
                fullWidth
                value={insert?.account_uid}
                error={insert?.account_uid ? isNaN(insert.account_uid) : false}
                onChange={(e) => setInsert((prev) => ({ ...prev, account_uid: Number(e.target.value) }))}
            />
        </>
    );
}