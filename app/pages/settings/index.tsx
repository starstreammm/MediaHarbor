import {
    Box,
    Typography,
    TextField,
    useMediaQuery,
    Autocomplete,
} from "@mui/material";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router";

import StorageSettings from "./storage";
import AppBar from "~/components/appbar";
import { fetchSettings, updateSettings } from "~/function/setting";
import type { TableSettings } from "~/model/table";


export default function Settings() {
    const { mobilDrawer } =
        useOutletContext<{
            appBarHeight: number,
            drawerWidth: number,
            mobilDrawer: () => void,
        }>();
    const isUpMd = useMediaQuery((theme) => theme.breakpoints.up("md"));
    const client = useQueryClient();
    const settings = useQuery({ queryKey: ["storage-settings"], queryFn: fetchSettings });
    const [savingLogLevel, setSavingLogLevel] = useState(false);

    return (
        <>
            <AppBar mobilDrawer={mobilDrawer} label="Settings" />
            <Box sx={{ display: "flex", width: "100%", flexDirection: "column", px: 3, pt: 1 }}>
                <Box sx={{
                    display: "flex",
                    flexDirection: "column",
                    height: `calc(100vh - ${isUpMd ? 127 : 107}px)`,

                    overflowY: "auto",
                    scrollbarWidth: 'none',     // Firefox
                    msOverflowStyle: 'none',    // IE 10+
                    '&::-webkit-scrollbar': {   // Chrome / Safari
                        display: 'none',
                    },
                }}>
                    <StorageSettings />
                    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 3, mb: 3, mt: 1 }}>
                        <Typography variant="h6">
                            Log Level
                        </Typography>
                        <Autocomplete
                            autoComplete
                            disableClearable
                            options={["DEBUG", "INFO", "WARNING", "ERROR"]}
                            sx={{ width: 220, maxWidth: "100%", flexShrink: 0 }}
                            disabled={!settings.data || savingLogLevel}
                            value={settings.data?.log_level ?? ""}
                            onChange={async (_, newValue) => {
                                if (newValue === settings.data?.log_level) return;
                                setSavingLogLevel(true);
                                try {
                                    const saved = await updateSettings({ log_level: newValue });
                                    client.setQueryData<TableSettings>(["storage-settings"], (previous) => previous
                                        ? { ...previous, log_level: saved.log_level }
                                        : saved);
                                } catch {
                                    // updateSettings displays the error; keep the saved value selected.
                                } finally {
                                    setSavingLogLevel(false);
                                }
                            }}
                            renderInput={(params) => <TextField {...params} label="Log Level" helperText={savingLogLevel ? "Saving…" : undefined} />}
                        />
                    </Box>
                </Box>
            </Box>
        </>
    );
}
