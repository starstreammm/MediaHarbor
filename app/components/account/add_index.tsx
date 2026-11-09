import {
    useMediaQuery,
    AppBar,
    Box,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Tabs,
    Tab,
} from "@mui/material";
import { useColorScheme } from '@mui/material/styles';

import { useRef, useState } from "react";

import type { ApiAccountParse, ApiAccountInsert, InsertRef, ApiAccountCreate } from "~/model/api";
import { pushTaskSuccess, pushError, pushMsg } from "~/components/error_popout";
import UrlInsert from "./url";
import ManualInsert from "./manual";
import ParserInsert from "./parser";


export default function AddAccountDialog({ onSubmit, onRes, creator_uid = -1 }: {
    onSubmit?: (uids: number[] | undefined) => void;
    onRes?: (res: ApiAccountCreate[] | ApiAccountParse | ApiAccountInsert | undefined) => void;
    creator_uid?: number;
}) {
    // const
    const { mode, setMode } = useColorScheme();
    const preferIsLight = useMediaQuery("(prefers-color-scheme: light)");

    // state
    const [type, setType] = useState("bulk");
    const [loading, setLoading] = useState(false);
    const [bulkReady, setBulkReady] = useState(false);
    const [parserReady, setParserReady] = useState(false);
    const [manualReady, setManualReady] = useState(false);
    const ready = type === "bulk" ? bulkReady : type === "parser" ? parserReady : manualReady;

    // data
    const urlRef = useRef<InsertRef<ApiAccountCreate[], number[]>>(null);
    const parserRef = useRef<InsertRef<ApiAccountParse, number>>(null);
    const manualRef = useRef<InsertRef<ApiAccountInsert, number>>(null);


    const onClose = async (cancel: boolean) => {
        if (loading) return;
        if (cancel) {
            onSubmit?.(undefined);
            onRes?.(undefined);
            return;
        }
        if (!ready) return;
        setLoading(true);
        try {
            if (type === "bulk") {
                onRes?.(urlRef.current?.resData());
                if (onSubmit && urlRef.current) {
                    const uids = await urlRef.current.submit();
                    onSubmit(uids);
                    pushTaskSuccess(`${uids.length} account import task(s) submitted.`);
                }
            } else if (type === "parser") {
                onRes?.(parserRef.current?.resData());
                if (onSubmit && parserRef.current) {
                    const uid = await parserRef.current.submit();
                    onSubmit([uid]);
                    pushTaskSuccess(`Account import task submitted. UID: ${uid}.`);
                }
            } else {
                onRes?.(manualRef.current?.resData());
                if (onSubmit && manualRef.current) {
                    const uid = await manualRef.current.submit();
                    onSubmit([uid]);
                    pushMsg(`Account added successfully. UID: ${uid}.`, "success");
                }
            }
        } catch (error) {
            pushError(error, "Add account");
        } finally {
            setLoading(false);
        }
    };


    return (
        <Dialog
            open
            fullScreen
            onKeyDown={(e) => {
                if (e.key === "Escape") {
                    e.stopPropagation();
                    onClose(true);
                }
            }}
        >
            <DialogTitle sx={{ p: 0 }}>
                <AppBar position="static">
                    <Tabs
                        value={type}
                        onChange={(_, newValue) => { if (!loading) setType(newValue); }}
                        variant="fullWidth"
                        sx={(theme) => ({
                            "& .MuiTab-root.Mui-selected": {
                                color: mode === "light" || preferIsLight && mode === "system"
                                    ? "#ffffff"
                                    : theme.vars?.palette.primary.main,
                            },
                            "& .MuiTabs-indicator": {
                                backgroundColor: mode === "light" || preferIsLight && mode === "system"
                                    ? "#ffffff"
                                    : theme.vars?.palette.primary.main,
                            },
                        })}
                    >
                        <Tab label="Bulk Import" value="bulk" />
                        <Tab label="URL Parser" value="parser" />
                        <Tab label="Manual Insert" value="manual" />
                    </Tabs>
                </AppBar>
            </DialogTitle>
            <DialogContent sx={{ p: 0 }}>
                <Box sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: { xs: 1, md: 3 },
                    py: { xs: 1, md: 1.5 },
                    px: { xs: 1, md: 3 },
                }}>
                    <UrlInsert open={type === "bulk"} creator_uid={creator_uid} ref={urlRef} onReady={setBulkReady} />
                    <ManualInsert open={type === "manual"} setType={setType} defaultValue={{ creator_uid } as ApiAccountInsert} ref={manualRef} onReady={setManualReady} />
                    <ParserInsert open={type === "parser"} defaultValue={{ creator_uid } as ApiAccountParse} ref={parserRef} onReady={setParserReady} />
                </Box>
            </DialogContent>
            <DialogActions>
                <Box sx={{ display: "flex", gap: 3, p: { xs: 1, md: 3 } }}>
                    <Button onClick={() => void onClose(true)} variant="outlined" disabled={loading}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => onClose(false)}
                        variant="contained"
                        loading={loading}
                        disabled={!ready}
                    >
                        Apply
                    </Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}