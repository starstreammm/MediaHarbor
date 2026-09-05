import {
    Button,
    Box,
    Typography,
    TextField,
    useMediaQuery,
    Autocomplete,
} from "@mui/material";
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import EditOffRoundedIcon from '@mui/icons-material/EditOffRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';

import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router";

import AppBar from "~/components/appbar";
import { fetchSettings, updateSettings } from "~/function/setting";
import type { TableSettings } from "~/model/table";
import ApiInit from "~/pages/init/api_init";



export default function Collections() {
    const { mobilDrawer } =
        useOutletContext<{
            appBarHeight: number,
            drawerWidth: number,
            mobilDrawer: () => void,
        }>();
    const isUpMd = useMediaQuery((theme) => theme.breakpoints.up("md"));

    const apiInitRef = useRef<{ onSubmit: () => void }>(null);
    const [editing, setEditing] = useState(false);
    const [tmpSettings, setTmpSettings] = useState<Record<string, any>>({});
    const settings = useRef<TableSettings>({} as TableSettings);


    useEffect(() => {
        fetchSettings()
            .then((data) => settings.current = data);
    }, []);


    return (
        <>
            <AppBar mobilDrawer={mobilDrawer} label="Settings" />
            <Box sx={{ display: "flex", width: "100%", flexDirection: "column", px: 3, pt: 1 }}>
                <Box sx={{ display: "flex", width: "100%", justifyContent: "flex-end", gap: 1 }}>
                    {editing
                        ? <>
                            <Button
                                variant="contained"
                                onClick={() => {
                                    setEditing(false);
                                    setTmpSettings({} as TableSettings);
                                }}
                                color="error"
                                startIcon={<EditOffRoundedIcon />}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="contained"
                                onClick={() => {
                                    setEditing(false);
                                    apiInitRef.current?.onSubmit();
                                    updateSettings(tmpSettings)
                                        .then((data) => settings.current = data);
                                }}
                                startIcon={<TaskAltRoundedIcon />}
                            >
                                Save
                            </Button>
                        </>
                        : <Button
                            variant="contained"
                            onClick={() => setEditing(true)}
                            startIcon={<EditRoundedIcon />}
                        >
                            Edit
                        </Button>
                    }
                </Box>
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
                    <Box sx={{ display: "flex", alignItems: "center", gap: 3, mb: 3, mt: 1 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
                            Log Level
                        </Typography>
                        <Autocomplete
                            autoComplete
                            options={["DEBUG", "INFO", "WARNING", "ERROR"]}
                            sx={{ width: 133 }}
                            disabled={!editing}
                            value={(tmpSettings.log_level || settings.current.log_level) ?? null}
                            onChange={(_, newValue) => {
                                setTmpSettings((prev) => ({
                                    ...prev,
                                    log_level: newValue,
                                }));
                            }}
                            renderInput={(params) => <TextField {...params} label="Log Level" />}
                        />
                    </Box>
                    <ApiInit ref={apiInitRef} disabled={!editing} />
                </Box>
            </Box >
        </>
    )
}