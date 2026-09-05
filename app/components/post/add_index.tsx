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

import type { ApiPostInsert, ApiPostCreate, InsertRef } from "~/model/api";
import { pushTaskSuccess } from "~/components/error_popout";
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
    const [urls, setUrls] = useState<Record<string, string>>({});
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
                            if (resData) {
                                if (type === "from-url") {
                                    resData(Object.keys(urls).map((url) => ({ url })));
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
                                    Promise.allSettled(Object.keys(urls).map((url) => {
                                        return createSubmit(url);
                                    }))
                                        .then((results) => {
                                            const errors: Record<string, string> = {};
                                            results.forEach((result, index) => {
                                                if (result.status === "rejected") {
                                                    errors[Object.keys(urls)[index]] = result.reason?.message ?? String(result.reason);
                                                }
                                            });
                                            if (Object.keys(errors).length === 0) {
                                                const task_uids = results.map((result) => (result as PromiseFulfilledResult<number>).value);
                                                onClose(task_uids);
                                                pushTaskSuccess(`${task_uids.length} post(s) added from URLs successfully.`);
                                            }
                                            else { setUrls(errors); }
                                        })
                                        .finally(() => setLoading(false));
                                }
                                else {
                                    insertRef.current?.submit()
                                        .then((uid) => {
                                            onClose([uid]);
                                            pushTaskSuccess(`Post added successfully. Task UID: ${uid}.`);
                                        })
                                        .finally(() => setLoading(false));
                                }
                            }
                        }}
                        variant="contained"
                        disabled={type === "from-url" && Object.keys(urls).length === 0}
                        loading={loading}
                    >
                        Apply
                    </Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}