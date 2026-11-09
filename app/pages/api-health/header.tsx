import { useEffect, useRef, useState, type ReactNode } from "react";
import {
    Box, ClickAwayListener, IconButton, MenuItem, Paper, Popper,
    Stack, TextField, Tooltip, Typography, useTheme,
} from "@mui/material";
import FilterListRoundedIcon from "@mui/icons-material/FilterListRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import AppBar from "~/components/appbar";
import type { IntegrationService } from "~/model/integration";

export default function HealthHeader({ mobilDrawer, services, range, onRange,
    serviceFilter, onService, source, onSource, onSettings, children }: {
    mobilDrawer: () => void;
    services: IntegrationService[];
    range: string;
    onRange: (value: string) => void;
    serviceFilter: string;
    onService: (value: string) => void;
    source: string;
    onSource: (value: string) => void;
    onSettings: () => void;
    children: ReactNode;
}) {
    const theme = useTheme();
    const header = useRef<HTMLDivElement>(null);
    const [wide, setWide] = useState(false);
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    useEffect(() => {
        if (!header.current) return;
        const observer = new ResizeObserver(([entry]) => {
            const expanded = entry.contentRect.width >= theme.breakpoints.values.lg;
            setWide(expanded);
            if (expanded) setAnchor(null);
        });
        observer.observe(header.current);
        return () => observer.disconnect();
    }, [theme.breakpoints.values.lg]);
    const closeFilters = () => {
        setAnchor(null);
        anchor?.focus();
    };
    const controls = (
        <Stack direction={wide ? "row" : "column"} spacing={1} sx={{ alignItems: wide ? "center" : "stretch", minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                {services.length} platforms · {services.filter(service => service.status === "Healthy").length} healthy
            </Typography>
            <TextField select size="small" autoFocus={!wide && Boolean(anchor)} label="Time range" value={range} onChange={event => onRange(event.target.value)} sx={{ width: wide ? 165 : "100%", flexShrink: 0 }}>
                <MenuItem value="1h">Last hour</MenuItem><MenuItem value="24h">Last 24 hours</MenuItem><MenuItem value="7d">Last 7 days</MenuItem>
            </TextField>
            <TextField select size="small" label="Chart platform" value={serviceFilter} onChange={event => onService(event.target.value)} sx={{ width: wide ? 150 : "100%", flexShrink: 0 }}>
                <MenuItem value="all">All platforms</MenuItem>
                {services.map(service => <MenuItem key={service.uid} value={String(service.uid)}>{service.name}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Request source" value={source} onChange={event => onSource(event.target.value)} sx={{ width: wide ? 150 : "100%", flexShrink: 0 }}>
                <MenuItem value="all">All requests</MenuItem><MenuItem value="user">User requests</MenuItem><MenuItem value="health">Health checks</MenuItem>
            </TextField>
        </Stack>
    );
    const actions = <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
        <Tooltip title="Guest pool settings"><IconButton aria-label="Guest pool settings" onClick={() => { setAnchor(null); onSettings(); }}><SettingsRoundedIcon fontSize="small" /></IconButton></Tooltip>
        {children}
    </Stack>;

    return <>
        <Box ref={header}>
            <AppBar mobilDrawer={mobilDrawer} label="API Health" button={
                wide ? <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>{controls}{actions}</Stack>
                    : <Tooltip title="API Health filters and settings"><IconButton aria-label="API Health filters and settings" aria-haspopup="dialog" aria-expanded={Boolean(anchor)}
                        onClick={event => setAnchor(anchor ? null : event.currentTarget)}><FilterListRoundedIcon /></IconButton></Tooltip>
            } />
        </Box>
        <Popper open={!wide && Boolean(anchor)} anchorEl={anchor} placement="bottom-end" sx={{ zIndex: theme.zIndex.modal }} modifiers={[{ name: "offset", options: { offset: [0, 8] } }]}>
            <ClickAwayListener onClickAway={() => setAnchor(null)}>
                <Paper role="dialog" aria-label="API Health filters" elevation={8} sx={{ p: 2, width: "min(340px, calc(100vw - 32px))" }}
                    onKeyDown={event => { if (event.key === "Escape") closeFilters(); }}>
                    <Stack spacing={2}>{controls}{actions}</Stack>
                </Paper>
            </ClickAwayListener>
        </Popper>
    </>;
}
