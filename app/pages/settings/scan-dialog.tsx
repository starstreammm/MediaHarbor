import type { Dispatch, SetStateAction } from "react";
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    LinearProgress,
    Step,
    StepLabel,
    Stepper,
    TextField,
    Typography,
} from "@mui/material";

export type Scan = {
    id: string;
    status: "running" | "completed" | "error";
    step: number;
    processed: number;
    total: number;
    missing: number;
    remapped: number;
    deleted: number;
    protected: number;
    errors: string[];
    error?: string;
};

const steps = [
    "Count file references",
    "Update paths and check files",
    "Delete unused files",
];

type ScanDialogProps = {
    mode: "paths" | "clean" | null;
    paths: { data_path: string; aria2_path: string };
    onPathsChange: Dispatch<SetStateAction<ScanDialogProps["paths"]>>;
    scan: Scan | null;
    starting: boolean;
    startError: string | null;
    pollError: boolean;
    onClose: () => void;
    onStart: () => void;
};

export default function ScanDialog({
    mode,
    paths,
    onPathsChange,
    scan,
    starting,
    startError,
    pollError,
    onClose,
    onStart,
}: ScanDialogProps) {
    const busy = starting || scan?.status === "running";

    return (
        <Dialog
            open={mode !== null}
            fullWidth
            maxWidth="sm"
            onClose={() => {
                if (!busy) onClose();
            }}
        >
            <DialogTitle>
                {mode === "paths"
                    ? "Change storage paths"
                    : "Clean unused files"}
            </DialogTitle>
            <DialogContent
                sx={{ display: "flex", flexDirection: "column", gap: 2 }}
            >
                {mode === "paths" && (
                    <>
                        <Alert severity="info">
                            Move or remount your files first. This updates
                            stored paths and checks the new locations; it
                            does not move files. Finish downloads and
                            running tasks before scanning.
                        </Alert>
                        <TextField
                            sx={{ mt: 1 }}
                            label="Data path"
                            value={paths.data_path}
                            disabled={busy || scan !== null}
                            onChange={(event) =>
                                onPathsChange((previous) => ({
                                    ...previous,
                                    data_path: event.target.value,
                                }))
                            }
                        />
                        <TextField
                            label="Aria2 path"
                            value={paths.aria2_path}
                            disabled={busy || scan !== null}
                            onChange={(event) =>
                                onPathsChange((previous) => ({
                                    ...previous,
                                    aria2_path: event.target.value,
                                }))
                            }
                        />
                    </>
                )}
                <Stepper
                    activeStep={scan?.step ?? 0}
                    orientation="vertical"
                >
                    {steps.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>
                {busy && (
                    <>
                        <LinearProgress
                            variant={
                                scan?.total
                                    ? "determinate"
                                    : "indeterminate"
                            }
                            value={
                                scan?.total
                                    ? (100 * scan.processed) / scan.total
                                    : 0
                            }
                        />
                        <Typography role="status">
                            Scanning… {scan?.processed ?? 0} /{" "}
                            {scan?.total ?? 0}. Keep this dialog open.
                        </Typography>
                    </>
                )}
                {pollError && (
                    <Alert severity="warning">
                        Cannot retrieve progress. Reconnecting
                        automatically; the scan may still be running.
                    </Alert>
                )}
                {startError && <Alert severity="error">{startError}</Alert>}
                {scan?.status === "error" && (
                    <Alert severity="error">{scan.error}</Alert>
                )}
                {scan?.status === "completed" && (
                    <Alert
                        severity={
                            scan.errors.length ? "warning" : "success"
                        }
                    >
                        Scanned {scan.total} files. Updated {scan.remapped}{" "}
                        paths; found {scan.missing} missing files; deleted{" "}
                        {scan.deleted} unused files; protected{" "}
                        {scan.protected} files.
                    </Alert>
                )}
                {scan?.errors.map((error) => (
                    <Alert key={error} severity="error">
                        {error}
                    </Alert>
                ))}
            </DialogContent>
            {(mode === "paths" || !busy) && <DialogActions>
                <Button
                    color="error"
                    variant="outlined"
                    disabled={busy}
                    onClick={onClose}
                >
                    {mode === "clean" || scan ? "Close" : "Cancel"}
                </Button>
                {mode === "paths" && !scan && (
                    <Button
                        variant="contained"
                        loading={starting}
                        disabled={
                            mode === "paths" &&
                            (!paths.data_path.trim() ||
                                !paths.aria2_path.trim())
                        }
                        onClick={onStart}
                    >
                        Start scan
                    </Button>
                )}
            </DialogActions>}
        </Dialog>
    );
}
