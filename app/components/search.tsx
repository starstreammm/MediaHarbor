import {
    Box,
    InputBase,
    IconButton,
    useTheme,
    useMediaQuery,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { alpha } from "@mui/material/styles";

import { useEffect, useState, useRef } from "react";


export default function ResponsiveSearch({
    placeholder = "Search…",
    onEnd,
}: {
    placeholder?: string;
    onEnd: (value: string[]) => void;
}) {
    const theme = useTheme();
    const isMdUp = useMediaQuery(theme.breakpoints.up("md"));

    const [open, setOpen] = useState<boolean>(false);
    const [focused, setFocused] = useState<boolean>(false);
    const [content, setContent] = useState<string>("");

    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (open && inputRef.current) {
            inputRef.current.focus();
        }
    }, [open]);

    return (
        <Box sx={{ display: "flex", alignItems: "center" }}>
            {isMdUp ? (
                <Box
                    sx={{
                        position: "relative",
                        borderRadius: 2,
                        backgroundColor: alpha(theme.palette.common.black, 0.05),
                        "&:hover": {
                            backgroundColor: alpha(theme.palette.common.black, 0.08),
                        },
                        display: "flex",
                        alignItems: "center",
                        px: 1,
                        transition: "all 0.2s ease",
                        transform: focused ? "scale(1.05)" : "scale(1)",
                    }}
                >
                    <SearchIcon sx={{ mr: 1, color: "text.secondary" }} />

                    <InputBase
                        placeholder={placeholder}
                        inputRef={inputRef}
                        onFocus={() => setFocused(true)}
                        onBlur={() => { setFocused(false); onEnd?.(content.trim().split(/\s+/)); }}
                        onChange={(e) => setContent(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                e.stopPropagation();
                                setFocused(false);
                                onEnd?.(content.trim().split(/\s+/));
                                inputRef.current?.blur();
                            }
                        }}
                        sx={{
                            width: 130,
                            transition: "width 0.2s",
                            "&:focus-within": {
                                width: 180,
                            },
                        }}
                    />
                </Box>
            ) : (
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        borderRadius: 2,
                        backgroundColor: open
                            ? alpha(theme.palette.common.black, 0.05)
                            : "transparent",
                        transition: "all 0.25s ease",
                        overflow: "hidden",
                        width: open || content ? 130 : 40,
                    }}
                >
                    <IconButton
                        size="small"
                        onClick={() => setOpen((v) => !v)}
                    >
                        <SearchIcon />
                    </IconButton>

                    <InputBase
                        placeholder={placeholder}
                        inputRef={inputRef}
                        onChange={(e) => setContent(e.target.value)}
                        onBlur={() => { setOpen(false); onEnd?.(content.trim().split(/\s+/)); }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                e.stopPropagation();
                                setFocused(false);
                                onEnd?.(content.trim().split(/\s+/));
                                inputRef.current?.blur();
                            }
                        }}
                        sx={{
                            flex: 1,
                            opacity: open || content ? 1 : 0,
                            transition: "opacity 0.2s",
                        }}
                    />
                </Box>
            )}
        </Box>
    );
};