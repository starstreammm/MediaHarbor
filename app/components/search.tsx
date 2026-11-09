import {
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    InputBase,
    useMediaQuery,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useEffect, useId, useRef, useState } from "react";

export default function ResponsiveSearch({
    placeholder = "search （space to add)",
    value = [],
    onEnd,
}: {
    placeholder?: string;
    value?: string[];
    onEnd: (value: string[]) => void;
}) {
    const [input, setInput] = useState("");
    const [open, setOpen] = useState(false);
    const isMdUp = useMediaQuery((theme) => theme.breakpoints.up("md"));
    const inputRef = useRef<HTMLInputElement>(null);
    const keywordsRef = useRef<HTMLDivElement>(null);
    const titleId = useId();

    useEffect(() => {
        if (isMdUp) setOpen(false);
    }, [isMdUp]);

    useEffect(() => {
        if (document.activeElement === inputRef.current && keywordsRef.current) {
            keywordsRef.current.scrollLeft = keywordsRef.current.scrollWidth;
        }
    }, [value]);

    const submit = (text: string) => {
        const terms = text.split(/\s+/).filter(Boolean);
        if (terms.length) {
            onEnd([...new Set([...value, ...terms])]);
        }
        setInput("");
    };

    const closeDialog = () => {
        submit(input);
        setOpen(false);
    };

    const searchField = (
        <Box
            sx={{
                display: "flex",
                alignItems: "center",
                flexWrap: "nowrap",
                gap: 0.5,
                px: 1,
                py: 0.5,
                width: isMdUp ? "fit-content" : "100%",
                maxWidth: isMdUp ? "min(100%, 480px)" : "100%",
                minWidth: 0,
                borderRadius: 2,
                bgcolor: "action.hover",
                ...(isMdUp && {
                    transition:
                        "transform 200ms ease-out, background-color 200ms ease-out",
                    "&:focus-within": {
                        transform: "scale(1.05)",
                    },
                    "@media (hover: hover) and (pointer: fine)": {
                        "&:hover": {
                            transform: "scale(1.05)",
                            bgcolor: "action.selected",
                        },
                    },
                    "@media (prefers-reduced-motion: reduce)": {
                        transition: "none",
                        "&:hover, &:focus-within": {
                            transform: "none",
                        },
                    },
                }),
            }}
        >
            <IconButton
                size="small"
                aria-label="Search"
                sx={{
                    width: { xs: 44, md: 28 },
                    height: { xs: 44, md: 28 },
                    flexShrink: 0,
                }}
                onClick={() => {
                    submit(input);
                    inputRef.current?.focus();
                }}
            >
                <SearchIcon fontSize="small" />
            </IconButton>
            <Box
                ref={keywordsRef}
                sx={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "nowrap",
                    gap: 0.5,
                    minWidth: 0,
                    overflowX: "auto",
                    overflowY: "hidden",
                    scrollbarWidth: "thin",
                }}
            >
                {value.map((term, index) => (
                    <Chip
                        key={term}
                        label={term}
                        size="small"
                        sx={{ flexShrink: 0, maxWidth: "none" }}
                        onDelete={() => onEnd(value.filter((_, i) => i !== index))}
                    />
                ))}
                <InputBase
                    autoFocus={!isMdUp}
                    inputRef={inputRef}
                    value={input}
                    placeholder={value.length === 0 ? placeholder : ""}
                    inputProps={{
                        "aria-label": "Search terms separated by spaces",
                        enterKeyHint: "search",
                    }}
                    onChange={(event) => {
                        const text = event.target.value;
                        if (
                            !(event.nativeEvent as InputEvent).isComposing &&
                            /\s/.test(text)
                        ) {
                            submit(text);
                        } else {
                            setInput(text);
                        }
                    }}
                    onBlur={() => submit(input)}
                    onKeyDown={(event) => {
                        if (
                            event.key === "Backspace" &&
                            !event.nativeEvent.isComposing &&
                            input === "" &&
                            value.length > 0
                        ) {
                            event.preventDefault();
                            onEnd(value.slice(0, -1));
                        }
                        if (
                            event.key === "Enter" &&
                            !event.nativeEvent.isComposing
                        ) {
                            event.preventDefault();
                            submit(input);
                        }
                    }}
                    sx={{ flex: "0 0 200px", width: 200, fontSize: 16 }}
                />
            </Box>
        </Box>
    );

    if (isMdUp) return searchField;

    return (
        <>
            <IconButton
                aria-label="Open search"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpen(true)}
                sx={{ width: 44, height: 44 }}
            >
                <SearchIcon />
            </IconButton>
            <Dialog
                open={open}
                onClose={closeDialog}
                aria-labelledby={titleId}
                fullWidth
                maxWidth="sm"
                slotProps={{
                    backdrop: { sx: { bgcolor: "rgba(0, 0, 0, 0.6)" } },
                }}
            >
                <DialogTitle id={titleId}>Search</DialogTitle>
                <DialogContent>{searchField}</DialogContent>
                <DialogActions>
                    <Button onClick={closeDialog}>search</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
