import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, Button, IconButton, TextField, Tooltip, Typography } from "@mui/material";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { api } from "~/hooks/api";
import { fetchSettings } from "~/function/setting";
import { pushError } from "~/components/error_popout";
import ScanDialog, { type Scan } from "./scan-dialog";
import ScanSchedule from "./scan-schedule";

export default function StorageSettings() {
    const client = useQueryClient();
    const settings = useQuery({
        queryKey: ["storage-settings"],
        queryFn: fetchSettings,
    });
    const [dialog, setDialog] = useState<"paths" | "clean" | null>(null);
    const [paths, setPaths] = useState({ data_path: "", aria2_path: "" });
    const [starting, setStarting] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);
    const [scan, setScan] = useState<Scan | null>(null);
    const lastCompleted = useRef<string | undefined>(undefined);
    const [pollError, setPollError] = useState(false);
    const busy = starting || scan?.status === "running";

    useEffect(() => {
        if (starting) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout>;
        async function poll() {
            try {
                const result = await api
                    .get("/api/system/files/scan")
                    .json<Scan | { status: "idle"; step: number }>();
                if (cancelled) return;
                setPollError(false);
                if (result.status === "running") {
                    setStartError(null);
                    setScan(result);
                    setDialog((current) => current ?? "clean");
                } else {
                    setScan((current) => {
                        if (result.status === "idle") {
                            if (current?.status === "running") {
                                return {
                                    ...current,
                                    status: "error",
                                    error: "The server restarted. Run another scan to refresh the result.",
                                };
                            }
                            return current;
                        }
                        return current?.id === result.id ? result : current;
                    });
                }
                if (
                    result.status === "completed" &&
                    result.id !== lastCompleted.current
                ) {
                    lastCompleted.current = result.id;
                    void client.invalidateQueries({
                        queryKey: ["storage-settings"],
                    });
                    void client.invalidateQueries({ queryKey: ["file-info"] });
                }
            } catch {
                if (!cancelled) setPollError(true);
            }
            if (!cancelled) timer = setTimeout(poll, 1500);
        }
        void poll();
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [client, starting]);

    async function start(request: Partial<typeof paths>) {
        setStarting(true);
        setStartError(null);
        try {
            setScan(
                await api
                    .post("/api/system/files/scan", {
                        json: request,
                    })
                    .json<Scan>(),
            );
        } catch (error) {
            pushError(error, "Start file scan");
            setStartError("Unable to start the scan. Close this dialog and try again.");
        } finally {
            setStarting(false);
        }
    }

    function open(mode: "paths" | "clean") {
        if (busy || !settings.data) return;
        setPaths({
            data_path: settings.data.data_path,
            aria2_path: settings.data.aria2_path,
        });
        setScan(null);
        setStartError(null);
        setDialog(mode);
        if (mode === "clean") void start({});
    }

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                py: 2,
                maxWidth: 800,
            }}
        >
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Typography variant="h6">Storage</Typography>
                <Button
                    variant="outlined"
                    size="small"
                    disabled={!settings.data || busy}
                    onClick={() => open("paths")}
                >
                    Edit paths
                </Button>
            </Box>
            <TextField
                label="Data path"
                value={settings.data?.data_path ?? ""}
                slotProps={{ input: { readOnly: true } }}
            />
            <TextField
                label="Aria2 path"
                value={settings.data?.aria2_path ?? ""}
                slotProps={{ input: { readOnly: true } }}
            />
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                <Typography variant="h6">File Cleanup</Typography>
                <Tooltip title="Scans registered files. Unused uploads are protected for 24 hours; files referenced by unfinished tasks are kept. Scheduled scans use UTC and require the server to be running.">
                    <IconButton aria-label="File cleanup information">
                        <InfoOutlinedIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Run a scan and clean unused files">
                    <span>
                        <IconButton
                            color="primary"
                            aria-label="Run file cleanup"
                            disabled={!settings.data || busy}
                            onClick={() => open("clean")}
                        >
                            <PlayArrowRoundedIcon />
                        </IconButton>
                    </span>
                </Tooltip>
            </Box>
            <ScanSchedule settings={settings.data} />
            <ScanDialog
                mode={dialog}
                paths={paths}
                onPathsChange={setPaths}
                scan={scan}
                starting={starting}
                startError={startError}
                pollError={pollError}
                onClose={() => setDialog(null)}
                onStart={() => void start(paths)}
            />
        </Box>
    );
}
