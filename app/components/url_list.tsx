import {
    Box,
    ButtonBase,
    IconButton,
    TextField,
    Typography,
} from "@mui/material";
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import AddCircleRoundedIcon from '@mui/icons-material/AddCircleRounded';

import { useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { ApiUrlCheck, UrlCheckState } from "~/model/api";
import UrlCheckStatus from "./url_check_status";
import { pushMsg } from "~/components/error_popout";
import { urlRegex } from "~/model/const";


function exeUrls(urls: string) {
    const matches = urls.match(urlRegex);
    if (matches) {
        return {
            ...matches.reduce((acc, url) => {
                acc[url] = { status: "checking" };
                return acc;
            }, {} as Record<string, UrlCheckState>)
        };
    }
    else {
        pushMsg("No valid URL found in the input.", "warning");
        return {};
    }
}

export default function UrlInsert({ open, urls, onChange, checkUrl, optional }: {
    open: boolean;
    urls: Record<string, UrlCheckState>;
    onChange: Dispatch<SetStateAction<Record<string, UrlCheckState>>>;
    checkUrl: (url: string) => Promise<ApiUrlCheck>;
    optional?: (url: string) => React.ReactNode;
}) {
    const [add, setAdd] = useState(false);
    const [urlsInput, setUrlsInput] = useState<string>("");
    const requests = useRef<Record<string, number>>({});

    if (!open) return null;

    const addUrls = (urls: string) => {
        setAdd(false);
        setUrlsInput("");
        const newUrls = exeUrls(urls);
        onChange(prev => ({ ...prev, ...newUrls }));
        Object.keys(newUrls).forEach((url) => {
            const request = (requests.current[url] ?? 0) + 1;
            requests.current[url] = request;
            checkUrl(url)
                .then((res) => {
                    if (requests.current[url] !== request) return;
                    onChange((prev) => url in prev ? { ...prev, [url]: res } : prev);
                });
        });
    }


    return (
        <>
            {add
                ? <Box sx={{
                    display: "flex",
                    alignItems: "center",
                    width: "100%",
                    gap: { xs: 1, md: 3 },
                }}>
                    <IconButton onClick={() => addUrls(urlsInput)}>
                        <DoneAllRoundedIcon color="success" />
                    </IconButton>
                    <TextField
                        fullWidth
                        placeholder="Enter URL(s). Automatic detection and multiple URLs supported."
                        multiline
                        minRows={3}
                        value={urlsInput}
                        onChange={(e) => setUrlsInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.stopPropagation();
                                addUrls(urlsInput);
                            }
                            if (e.key === "Escape") {
                                e.stopPropagation();
                                setAdd(false);
                            }
                        }}
                    />
                </Box>
                : <ButtonBase
                    onClick={() => setAdd(true)}
                    sx={{
                        display: "flex",
                        justifyContent: "flex-start",
                        alignItems: "center",
                        width: "100%",
                        gap: { xs: 2, md: 4 },
                        py: 1.5,
                        px: 1.5,
                    }}>
                    <AddCircleRoundedIcon color="primary" />
                    <Typography color="primary">
                        Add More
                    </Typography>
                </ButtonBase >
            }
            {
                Object.keys(urls).map((u, i) => (
                    <Box key={u} sx={{
                        display: "flex",
                        alignItems: "center",
                        width: "100%",
                        gap: { xs: 1, md: 3 },
                        pl: 0.5,
                    }}>
                        <IconButton onClick={() => {
                            requests.current[u] = (requests.current[u] ?? 0) + 1;
                            const newUrls = { ...urls };
                            delete newUrls[u];
                            onChange(newUrls);
                        }}>
                            <CancelRoundedIcon color="error" />
                        </IconButton>
                        <Typography color={urls[u].status !== "passed" ? "textDisabled" : "textPrimary"} sx={{ width: "100%", overflowWrap: "anywhere", }}>
                            {u}
                        </Typography>
                        <Box sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 88,
                            gap: { xs: 1, md: 3 },
                        }}>
                            {urls[u].status === "passed" && optional?.(u)}
                            <UrlCheckStatus result={urls[u]} />
                        </Box>
                    </Box>
                ))
            }
        </>
    );

}
