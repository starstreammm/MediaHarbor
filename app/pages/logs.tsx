import {
    Box,
    Button,
    Badge,
    Popper,
    Paper,
    MenuList,
    MenuItem,
    useMediaQuery,
    Tooltip,
    Switch,
    Typography,
    IconButton,
    Fab,
} from "@mui/material";
import { useColorScheme } from '@mui/material/styles';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import VerticalAlignBottomRoundedIcon from '@mui/icons-material/VerticalAlignBottomRounded';

import { useOutletContext } from "react-router";
import { useEffect, useRef, useState } from "react";

import { Editor, type BeforeMount } from "@monaco-editor/react";
import type * as editor from "monaco-editor"

import { useLocalStorage } from "~/hooks/storage";
import AppBar from "~/components/appbar";
import { pushError } from "~/components/error_popout";
import { api } from "../hooks/api";



export default function Collections() {
    // const
    const { mobilDrawer } =
        useOutletContext<{
            appBarHeight: number,
            drawerWidth: number,
            mobilDrawer: () => void,
        }>();
    const { mode, setMode } = useColorScheme();
    const preferIsDark = useMediaQuery("(prefers-color-scheme: dark)");
    const isUpMd = useMediaQuery((theme) => theme.breakpoints.up("md"), { noSsr: true });

    // data
    const [ls, setLs] = useState<string[]>([]);
    const [connect, setConnect] = useState<boolean>(false);
    const [logs, setLogs] = useState<string[]>([]);

    // state
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
    const [wordWrap, setWordWrap] = useLocalStorage("logs_word_wrap", false, "local");
    const editorRef = useRef<editor.editor.IStandaloneCodeEditor | null>(null);

    useEffect(() => {
        getLogsList().then((res) => setLs(res));

        const event = new EventSource("/api/system/logs");
        event.onopen = () => setConnect(true);
        event.onmessage = (e) => {
            setLogs((prev) => {
                const next = [...prev, e.data];

                return next.length > 1000
                    ? next.slice(-1000)
                    : next;
            });
        };
        event.onerror = () => setConnect(false);

        return () => event.close();
    }, []);

    useEffect(() => {
        if (!editorRef.current) return;

        const threshold = 5;

        const isAtBottom =
            editorRef.current.getScrollTop() + editorRef.current.getLayoutInfo().height >=
            editorRef.current.getScrollHeight() - threshold;

        if (isAtBottom) {
            requestAnimationFrame(() => {
                editorRef.current?.setScrollTop(editorRef.current.getScrollHeight());
            });
        }
    }, [logs]);

    return (
        <>
            <AppBar mobilDrawer={mobilDrawer} label="Logs" button={
                <Box sx={{ display: "flex", gap: { xs: 1, md: 3 }, alignItems: "center" }}>
                    {isUpMd
                        ? <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                            <Typography variant="body1">
                                Word Wrap
                            </Typography>
                            <Switch
                                checked={wordWrap}
                                onChange={(e) => setWordWrap(e.target.checked)}
                            />
                        </Box>
                        : <Tooltip title="Word Wrap">
                            <Switch
                                checked={wordWrap}
                                onChange={(e) => setWordWrap(e.target.checked)}
                            />
                        </Tooltip>
                    }

                    <Badge color={connect ? "success" : "error"} variant="dot">
                        <Box onMouseLeave={() => setAnchorEl(null)} sx={{ p: 1, display: "inline-flex" }}>
                            {isUpMd
                                ? <Button
                                    onMouseEnter={(event) => setAnchorEl(event.currentTarget)}
                                    onClick={() => {
                                        downloadLog();
                                        setAnchorEl(null);
                                    }}
                                    startIcon={<DownloadRoundedIcon />}
                                    variant="contained"
                                >
                                    Download
                                </Button>
                                : <IconButton
                                    onMouseEnter={(event) => setAnchorEl(event.currentTarget)}
                                    onClick={() => {
                                        downloadLog();
                                        setAnchorEl(null);
                                    }}
                                >
                                    <DownloadRoundedIcon />
                                </IconButton>
                            }

                            <Popper
                                open={Boolean(anchorEl)}
                                anchorEl={anchorEl}
                                placement="bottom-start"
                                sx={{ pt: 1, zIndex: 1300 }}
                            >
                                <Paper elevation={13}>
                                    <MenuList>
                                        {ls.map(date =>
                                            <MenuItem
                                                key={date}
                                                onClick={() => {
                                                    downloadLog(date);
                                                    setAnchorEl(null);
                                                }}
                                            >
                                                {date}
                                            </MenuItem>
                                        )}
                                    </MenuList>
                                </Paper>
                            </Popper>
                        </Box>
                    </Badge>
                </Box>
            } />
            <Editor
                height={`calc(100vh - ${isUpMd ? 81 : 61}px)`}
                language="log"
                value={logs.join("\n")}
                beforeMount={handleEditorBeforeMount}
                onMount={(editor) => {
                    editorRef.current = editor;
                    requestAnimationFrame(() => {
                        editor.layout();
                        editor.setScrollTop(editor.getScrollHeight());
                    });
                }}
                theme={mode === "dark" || (mode === "system" && preferIsDark) ? "log-dark" : "log-light"}
                options={{
                    fontSize: 13,
                    readOnly: true,
                    scrollBeyondLastLine: false,
                    wordWrap: wordWrap ? "on" : "off",
                    lineNumbers: "off",
                }}
            />
            <Fab
                color="primary"
                sx={{ position: "absolute", bottom: { xs: 13, md: 23 }, right: { xs: 13, md: 23 } }}
                onClick={() => {
                    if (!editorRef.current) return;
                    editorRef.current.setScrollTop(editorRef.current.getScrollHeight());
                }}
            >
                <VerticalAlignBottomRoundedIcon />
            </Fab>
        </>
    )
}



const handleEditorBeforeMount: BeforeMount = (monaco: typeof editor) => {
    monaco.languages.register({
        id: "log",
    });

    monaco.languages.setMonarchTokensProvider("log", {
        tokenizer: {
            root: [
                [
                    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/,
                    "log-time",
                ],

                [/\bERROR\b/, "log-error"],
                [/\bWARNING\b|\bWARN\b/, "log-warning"],
                [/\bINFO\b/, "log-info"],
                [/\bDEBUG\b/, "log-debug"],

                [/\b[\w.-]+\.py\b/, "log-file"],
                [/-\d+:/, "log-line"],
            ],
        },
    });

    monaco.editor.defineTheme("log-light", {
        base: "vs",
        inherit: true,
        colors: {},
        rules: [
            {
                token: "log-time",
                foreground: "4176B0",
            },
            {
                token: "log-error",
                foreground: "d32f2f",
                fontStyle: "bold",
            },
            {
                token: "log-warning",
                foreground: "ed6c02",
                fontStyle: "bold",
            },
            {
                token: "log-info",
                foreground: "0288d1",
                fontStyle: "bold",
            },
            {
                token: "log-debug",
                foreground: "666666",
            },
            {
                token: "log-file",
                foreground: "2e7d32",
            },
            {
                token: "log-line",
                foreground: "4176B0",
            },
        ],
    });

    monaco.editor.defineTheme("log-dark", {
        base: "vs-dark",
        inherit: true,
        colors: {},
        rules: [
            {
                token: "log-time",
                foreground: "B067A1",
            },
            {
                token: "log-error",
                foreground: "d32f2f",
                fontStyle: "bold",
            },
            {
                token: "log-warning",
                foreground: "ed6c02",
                fontStyle: "bold",
            },
            {
                token: "log-info",
                foreground: "0288d1",
                fontStyle: "bold",
            },
            {
                token: "log-debug",
                foreground: "888888",
            },
            {
                token: "log-file",
                foreground: "2e7d32",
            },
            {
                token: "log-line",
                foreground: "B067A1",
            },
        ],
    });
};


async function getLogsList() {
    try {
        const res = await api.get("/api/system/logs/list").json<string[]>();
        return res;
    }
    catch (e) {
        pushError(e, "Failed to get logs list");
        throw e;
    }
}


async function downloadLog(date_string?: string) {
    const date = date_string && !date_string.includes("today") ? date_string : undefined;

    try {
        const res = await api.get("/api/system/logs/download", { searchParams: { date } }).blob();
        const url = URL.createObjectURL(res);

        const a = document.createElement("a");
        a.href = url;
        a.download = "mediaharbor.log";
        a.click();

        URL.revokeObjectURL(url);
    }
    catch (e) {
        pushError(e, `Failed to download ${date_string} log`);
        throw e;
    }
}