import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Box, MenuItem, TextField } from "@mui/material";
import type { TableSettings } from "~/model/table";
import { updateSettings } from "~/function/setting";

const schedules = [
    ["", "Disabled"],
    ["0 * * * *", "Every hour"],
    ["0 0 * * *", "Every day"],
    ["0 0 * * 0", "Every week"],
    ["custom", "Custom"],
];

export default function ScanSchedule({ settings }: { settings?: TableSettings }) {
    const client = useQueryClient();
    const [scheduleChoice, setScheduleChoice] = useState<string | null>(null);
    const [customInput, setCustomInput] = useState<string | null>(null);
    const [customPending, setCustomPending] = useState(false);
    const [scheduleError, setScheduleError] = useState(false);
    const savedCron = settings?.file_scan_cron ?? "";
    const schedule =
        scheduleChoice ??
        (schedules.some(([value]) => value === savedCron)
            ? savedCron
            : "custom");
    const custom = customInput ?? savedCron;
    const [saving, setSaving] = useState(false);

    const saveSchedule = useCallback(
        async (cron: string) => {
            setSaving(true);
            setScheduleError(false);
            try {
                const saved = await updateSettings({ file_scan_cron: cron });
                client.setQueryData<TableSettings>(
                    ["storage-settings"],
                    (previous) => {
                        if (!previous) return saved;
                        return { ...previous, file_scan_cron: saved.file_scan_cron };
                    },
                );
            } catch {
                // updateSettings displays the server error; keep the draft available to edit.
                setScheduleError(true);
            } finally {
                setSaving(false);
            }
        },
        [client],
    );

    useEffect(() => {
        if (schedule !== "custom" || !customPending || saving) return;
        const timer = setTimeout(() => {
            setCustomPending(false);
            if (!custom.trim()) {
                setScheduleError(true);
                return;
            }
            void saveSchedule(custom.trim());
        }, 600);
        return () => clearTimeout(timer);
    }, [custom, customPending, saving, schedule, saveSchedule]);

    return (
        <>
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                <TextField
                    fullWidth
                    select
                    label="Scan schedule"
                    value={schedule}
                    disabled={!settings || saving}
                    helperText={saving ? "Saving…" : undefined}
                    onChange={(event) => {
                        const value = event.target.value;
                        setScheduleChoice(value);
                        setCustomPending(false);
                        setScheduleError(false);
                        if (value !== "custom") {
                            setCustomInput(null);
                            void saveSchedule(value);
                        }
                    }}
                >
                    {schedules.map(([value, label]) => (
                        <MenuItem key={value} value={value}>
                            {label}
                        </MenuItem>
                    ))}
                </TextField>
            </Box>
            {schedule === "custom" && (
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                    <TextField
                        fullWidth
                        label="Cron expression"
                        value={custom}
                        disabled={!settings}
                        error={scheduleError}
                        onChange={(event) => {
                            setCustomInput(event.target.value);
                            setCustomPending(true);
                            setScheduleError(false);
                        }}
                        placeholder="0 2 * * *"
                    />
                </Box>
            )}
            {scheduleError && (
                <Alert severity="error">
                    Schedule was not saved. Correct or change the value to
                    retry; the previous schedule remains active.
                </Alert>
            )}
        </>
    );
}
