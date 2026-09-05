import {
    Box,
    ButtonBase,
    IconButton,
    TextField,
    CircularProgress,
    Tooltip,
    Typography,
} from "@mui/material";
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import ReportGmailerrorredRoundedIcon from '@mui/icons-material/ReportGmailerrorredRounded';
import AddCircleRoundedIcon from '@mui/icons-material/AddCircleRounded';

import { useState, type Dispatch, type SetStateAction } from "react";

import { Platform } from "~/model/enum";
import { pushMsg } from "~/components/error_popout";
import { urlRegex } from "~/model/const";


function exeUrls(urls: string) {
    const matches = urls.match(urlRegex);
    if (matches) {
        return {
            ...matches.reduce((acc, url) => {
                acc[url] = "loading";
                return acc;
            }, {} as Record<string, string>)
        };
    }
    else {
        pushMsg("No valid URL found in the input.", "warning");
        return {};
    }
}

export default function UrlInsert({ open, urls, onChange, checkUrl, optional }: {
    open: boolean;
    urls: Record<string, string>;
    onChange: Dispatch<SetStateAction<Record<string, string>>>;
    checkUrl: (url: string) => Promise<string>;
    optional?: (url: string) => React.ReactNode;
}) {
    if (!open) return null;

    const [add, setAdd] = useState(false);
    const [urlsInput, setUrlsInput] = useState<string>("");

    const addUrls = (urls: string) => {
        setAdd(false);
        setUrlsInput("");
        const newUrls = exeUrls(urls);
        onChange(prev => ({ ...prev, ...newUrls }));
        Object.keys(newUrls).forEach((url) => {
            checkUrl(url)
                .then((res) => {
                    onChange((prev) => ({ ...prev, [url]: res }));
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
                            const newUrls = { ...urls };
                            delete newUrls[u];
                            onChange(newUrls);
                        }}>
                            <CancelRoundedIcon color="error" />
                        </IconButton>
                        <Typography sx={{ width: "100%", overflowWrap: "anywhere", }}>
                            {u}
                        </Typography>
                        <Box sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 88,
                            gap: { xs: 1, md: 3 },
                        }}>
                            {optional && optional(u)}
                            {urls[u] === "loading"
                                ? <Tooltip title="Checking...">
                                    <CircularProgress size={24} />
                                </Tooltip>
                                : Platform.includes(urls[u] as Platform)
                                    ? <Typography variant="body1" color="success" sx={{ pr: 1 }}>
                                        {urls[u].toUpperCase()}
                                    </Typography>
                                    : <Tooltip title={urls[u]} placement="top" arrow>
                                        <ReportGmailerrorredRoundedIcon color="error" />
                                    </Tooltip>
                            }
                        </Box>
                    </Box>
                ))
            }
        </>
    );

}