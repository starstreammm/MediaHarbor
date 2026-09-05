import { Box, Dialog, DialogContent, DialogTitle, Divider, IconButton, Paper, Typography, useTheme } from "@mui/material";
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { LineChart } from '@mui/x-charts/LineChart';

import { useEffect, useRef, useState } from "react";

import type { TableStatistics } from '~/model/status';
import { formatBytes } from "~/function/dashboard";

function getDateFormatter(width: number, dates: Date[]) {
    if (!dates.length) {
        return () => "";
    }

    const min = Math.min(...dates.map(d => d.getTime()));
    const max = Math.max(...dates.map(d => d.getTime()));

    const days = (max - min) / 86_400_000;

    // 根据宽度估算最多允许多少个标签
    const maxTicks = Math.max(2, Math.floor(width / 70));

    // 平均一个 tick 覆盖多少天
    const daysPerTick = days / maxTicks;

    if (daysPerTick <= 7) {
        return (date: Date) =>
            `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
    }

    if (daysPerTick <= 90) {
        return (date: Date) =>
            `${date.getFullYear()}.${date.getMonth() + 1}`;
    }

    return (date: Date) =>
        `${date.getFullYear()}`;
};


export function PostLineChart({ data }: { data: TableStatistics[] }) {
    const theme = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver(([entry]) => {
            setWidth(entry.contentRect.width);
        });

        observer.observe(containerRef.current);

        return () => observer.disconnect();
    }, [, data]);

    const date = data.map((day) => new Date(day.date));

    return (
        <LineChart
            ref={containerRef}
            xAxis={[{
                id: 'data',
                data: date,
                scaleType: 'time',
                valueFormatter: getDateFormatter(width, date),
                height: 25,
            }]}
            yAxis={[{
                id: 'volume',
                scaleType: 'linear',
                valueFormatter: (value: number) => Math.floor(value).toString(),
                width: 30,
            }]}
            slotProps={{ tooltip: { trigger: 'axis' } }}
            axisHighlight={{
                x: "line",
                y: "none",
            }}
            series={[
                {
                    yAxisId: 'volume',
                    label: 'Total',
                    color: theme.vars?.palette.primary.main,
                    data: data.map((day) =>
                        Object.entries(day)
                            .filter(([key]) => key.startsWith("post_len_"))
                            .reduce((acc, [_, value]) => acc + value, 0)
                    ),
                    highlightScope: { highlight: 'item' },
                    showMark: false,
                    curve: "monotoneX",
                },
                {
                    yAxisId: 'volume',
                    label: 'Douyin',
                    color: "#2b0a1d",
                    data: data.map((day) => day.post_len_douyin),
                    highlightScope: { highlight: 'item' },
                    showMark: false,
                    curve: "monotoneX",
                },
                {
                    yAxisId: 'volume',
                    label: 'Bilibili',
                    color: "#FF6699",
                    data: data.map((day) => day.post_len_bilibili),
                    highlightScope: { highlight: 'item' },
                    showMark: false,
                    curve: "monotoneX",
                },
                {
                    yAxisId: 'volume',
                    label: 'XHS',
                    color: "#ff2442",
                    data: data.map((day) => day.post_len_xhs),
                    highlightScope: { highlight: 'item' },
                    showMark: false,
                    curve: "monotoneX",
                },
                {
                    yAxisId: 'volume',
                    label: 'X',
                    color: "#000000",
                    data: data.map((day) => day.post_len_x),
                    highlightScope: { highlight: 'item' },
                    showMark: false,
                    curve: "monotoneX",
                },
                {
                    yAxisId: 'volume',
                    label: 'Ins',
                    color: "#6B5B95",
                    data: data.map((day) => day.post_len_ins),
                    highlightScope: { highlight: 'item' },
                    showMark: false,
                    curve: "monotoneX",
                },
                {
                    yAxisId: 'volume',
                    label: 'Youtube',
                    color: "#fe0132",
                    data: data.map((day) => day.post_len_youtube),
                    highlightScope: { highlight: 'item' },
                    showMark: false,
                    curve: "monotoneX",
                },
            ]}
        />
    )
}

export function FileLineChart({ data }: { data: TableStatistics[] }) {
    const theme = useTheme();
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver(([entry]) => {
            setWidth(entry.contentRect.width);
        });

        observer.observe(containerRef.current);

        return () => observer.disconnect();
    }, [, data]);

    const date = data.map((day) => new Date(day.date));
    const calTotal = (day: TableStatistics, len: boolean) => {
        return len
            ? day.file_len_photo + day.file_len_video
            : day.file_size_photo + day.file_size_video;
    }

    return (
        <LineChart
            ref={containerRef}
            xAxis={[{
                id: 'data',
                data: date,
                scaleType: 'time',
                valueFormatter: getDateFormatter(width, date),
                height: 25,
            }]}
            yAxis={[{
                id: 'len',
                scaleType: 'linear',
                valueFormatter: (value: number) => Math.floor(value).toString(),
                width: 'auto',
                position: 'right',
            },
            {
                id: 'size',
                scaleType: 'linear',
                valueFormatter: (value: number) => formatBytes(value),
                width: 'auto',
                position: 'left',
            }]}
            series={[
                {
                    yAxisId: 'len',
                    label: 'LenTotal',
                    color: theme.vars?.palette.primary.main,
                    data: data.map((day) => calTotal(day, true)),
                    highlightScope: { highlight: 'item' },
                    showMark: false,
                    curve: "monotoneX",
                },
                {
                    yAxisId: 'len',
                    label: 'LenVideo',
                    color: "#2b0a1d",
                    data: data.map((day) => day.file_len_video),
                    highlightScope: { highlight: 'item' },
                    showMark: false,
                    curve: "monotoneX",
                },
                {
                    yAxisId: 'len',
                    label: 'LenPhoto',
                    color: "#FF6699",
                    data: data.map((day) => day.file_len_photo),
                    highlightScope: { highlight: 'item' },
                    showMark: false,
                    curve: "monotoneX",
                },
                {
                    yAxisId: 'size',
                    label: 'SizeTotal',
                    color: theme.vars?.palette.secondary.main,
                    data: data.map((day) => calTotal(day, false)),
                    valueFormatter: (value: number | null) => formatBytes(value ?? 0),
                    highlightScope: { highlight: 'item' },
                    showMark: false,
                    curve: "monotoneX",
                },
                {
                    yAxisId: 'size',
                    label: 'SizeVideo',
                    color: "#000000",
                    data: data.map((day) => day.file_size_video),
                    valueFormatter: (value: number | null) => formatBytes(value ?? 0),
                    highlightScope: { highlight: 'item' },
                    showMark: false,
                    curve: "monotoneX",
                },
                {
                    yAxisId: 'size',
                    label: 'SizePhoto',
                    color: "#6B5B95",
                    data: data.map((day) => day.file_size_photo),
                    valueFormatter: (value: number | null) => formatBytes(value ?? 0),
                    highlightScope: { highlight: 'item' },
                    showMark: false,
                    curve: "monotoneX",
                },
            ]}
        />
    );
}

export function ShowChart({ children, title, height = "100%" }: {
    children: React.ReactNode;
    title: string;
    height?: string;
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Dialog open={open} onClose={() => setOpen(false)} fullScreen>
                <DialogTitle>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Typography variant="h5">
                            {title}
                        </Typography>
                        <Paper elevation={3}>
                            <IconButton onClick={() => setOpen(false)} sx={{ borderRadius: "8%" }}>
                                <CloseRoundedIcon />
                            </IconButton>
                        </Paper>
                    </Box>
                </DialogTitle>
                <Divider />
                <DialogContent sx={{ p: 0 }}>
                    {children}
                </DialogContent>
            </Dialog>
            <Box
                sx={{ height: height, width: "100%" }}
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen(true);
                }}
            >
                {children}
            </Box>
        </>
    );
}