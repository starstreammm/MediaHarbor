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
import { pushTaskSuccess } from "~/components/error_popout";
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

    // data
    const urlRef = useRef<InsertRef<ApiAccountCreate[], number[]>>(null);
    const parserRef = useRef<InsertRef<ApiAccountParse, number>>(null);
    const manualRef = useRef<InsertRef<ApiAccountInsert, number>>(null);


    const onClose = (cancel: boolean) => {
        if (cancel) {
            onSubmit?.(undefined);
            onRes?.(undefined);
        }
        else {
            if (type === "bulk") {
                onRes?.(urlRef.current?.resData());
                if (onSubmit)
                    urlRef.current?.submit()
                        .then((res) => {
                            onSubmit?.(res);
                            pushTaskSuccess(`${res.length} account(s) added from URLs successfully.`);
                        });
            }
            else if (type === "parser") {
                onRes?.(parserRef.current?.resData());
                if (onSubmit)
                    parserRef.current?.submit()
                        .then((res) => {
                            onSubmit?.([res]);
                            pushTaskSuccess(`Account added by parser successfully. Task UID: ${res}.`);
                        });
            }
            else {
                onRes?.(manualRef.current?.resData());
                if (onSubmit) {
                    manualRef.current?.submit()
                        .then((res) => {
                            onSubmit?.([res]);
                            pushTaskSuccess(`Account added manually successfully. Task UID: ${res}.`);
                        });
                }
            }
        }
    }


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
                    <UrlInsert open={type === "bulk"} creator_uid={creator_uid} ref={urlRef} />
                    <ManualInsert open={type === "manual"} setType={setType} defaultValue={{ creator_uid } as ApiAccountParse} ref={manualRef} />
                    <ParserInsert open={type === "parser"} defaultValue={{ creator_uid } as ApiAccountParse} ref={parserRef} />
                </Box>
            </DialogContent>
            <DialogActions>
                <Box sx={{ display: "flex", gap: 3, p: { xs: 1, md: 3 } }}>
                    <Button onClick={() => onClose(true)} variant="outlined">
                        Cancel
                    </Button>
                    <Button
                        onClick={() => onClose(false)}
                        variant="contained"
                        loading={loading}
                    >
                        Apply
                    </Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}