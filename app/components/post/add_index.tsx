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

import { useState, useRef } from "react";

import type { ApiPostInsert, ApiPostCreate, InsertRef, UrlCheckState } from "~/model/api";
import { pushTaskSuccess, pushMsg } from "~/components/error_popout";
import { createSubmit, checkUrl } from "~/function/post";
import UrlInsert from "../url_list";
import ManualInsert from "./manual";



export default function AddPostDialog({ onClose, resData }: {
    onClose: (uids: number[] | null) => void;
    resData?: (data: ApiPostInsert | ApiPostCreate[]) => void;
}) {
    const { mode, setMode } = useColorScheme();
    const preferIsLight = useMediaQuery("(prefers-color-scheme: light)");
    const [type, setType] = useState("from-url");
    const [loading, setLoading] = useState(false);
    const [urls, setUrls] = useState<Record<string, UrlCheckState>>({});
    const validUrls = Object.keys(urls).filter((url) => urls[url].status === "passed");
    const checking = Object.values(urls).some((result) => result.status === "checking");
    const insertRef = useRef<InsertRef<ApiPostInsert, number>>(null);

    return (
        <Dialog
            open
            fullScreen
            onKeyDown={(e) => {
                if (e.key === "Escape") {
                    e.stopPropagation();
                    onClose(null);
                }
            }}
        >
            <DialogTitle sx={{ p: 0 }}>
                <AppBar position="static">
                    <Tabs
                        value={type}
                        onChange={(_, newValue) => setType(newValue)}
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
                        <Tab label="From Url" value="from-url" />
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
                    <UrlInsert open={type === "from-url"} urls={urls} onChange={setUrls} checkUrl={checkUrl} />
                    <ManualInsert open={type === "manual"} ref={insertRef} />
                </Box>
            </DialogContent>
            <DialogActions>
                <Box sx={{ display: "flex", gap: 3, px: { xs: 1, md: 3 } }}>
                    <Button onClick={() => onClose(null)} variant="outlined">
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            if (loading || (type === "from-url" && (validUrls.length === 0 || checking))) return;
                            if (resData) {
                                if (type === "from-url") {
                                    resData(validUrls.map((url) => ({ url })));
                                }
                                else {
                                    const data = insertRef.current?.resData();
                                    if (data)
                                        resData(data);
                                }
                                onClose(null);
                            }
                            else {
                                setLoading(true);
                                if (type === "from-url") {
                                    Promise.allSettled(validUrls.map((url) => {
                                        return createSubmit(url);
                                    }))
                                        .then((results) => {
                                            const errors: Record<string, UrlCheckState> = {};
                                            results.forEach((result, index) => {
                                                if (result.status === "rejected") {
                                                    errors[validUrls[index]] = { status: "error", message: result.reason?.message ?? String(result.reason) };
                                                }
                                            });
                                            const task_uids = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
                                            if (task_uids.length > 0) {
                                                pushTaskSuccess(`${task_uids.length} post import task(s) submitted.`);
                                            }
                                            if (Object.keys(errors).length === 0) {
                                                onClose(task_uids);
                                            }
                                            else {
                                                setUrls((previous) => ({
                                                    ...Object.fromEntries(Object.entries(previous).filter(([url]) => !validUrls.includes(url))),
                                                    ...errors,
                                                }));
                                            }
                                        })
                                        .finally(() => setLoading(false));
                                }
                                else {
                                    insertRef.current?.submit()
                                        .then((uid) => {
                                            onClose([uid]);
                                            pushMsg(`Post added successfully. UID: ${uid}.`, "success");
                                        })
                                        .finally(() => setLoading(false));
                                }
                            }
                        }}
                        variant="contained"
                        disabled={type === "from-url" && (validUrls.length === 0 || checking)}
                        loading={loading}
                    >
                        Apply
                    </Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}
