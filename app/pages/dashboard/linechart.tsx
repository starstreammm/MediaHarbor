import { Box, Dialog, DialogContent, DialogTitle, Divider, IconButton, Paper, Typography, useTheme } from "@mui/material";
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { LineChart } from '@mui/x-charts/LineChart';

import { useEffect, useRef, useState } from "react";

import type { TableStatistics } from '~/model/status';
import { formatBytes, platformLabels, postCount } from "~/function/dashboard";
import type { Platform } from "~/model/enum";

const postAxisNumber = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

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


export function PostLineChart({ data, platform }: { data: TableStatistics[]; platform: Platform }) {
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
            hideLegend
            xAxis={[{
                id: 'data',
                data: date,
                scaleType: 'time',
                valueFormatter: getDateFormatter(width, date),
                tickNumber: Math.max(2, Math.floor(width / 100)),
                height: 25,
            }]}
            yAxis={[{
                id: 'volume',
                scaleType: 'linear',
                min: 0,
                tickMinStep: 1,
                valueFormatter: (value: number) => postAxisNumber.format(value),
                width: 'auto',
            }]}
            slotProps={{ tooltip: { trigger: 'axis' } }}
            axisHighlight={{
                x: "line",
                y: "none",
            }}
            series={[{
                yAxisId: 'volume',
                label: platformLabels[platform],
                color: theme.vars?.palette.primary.main,
                data: data.map(day => postCount(day, platform)),
                valueFormatter: value => value?.toLocaleString() ?? "",
                highlightScope: { highlight: 'item' },
                showMark: false,
                curve: "monotoneX",
            }]}
        />
    )
}

export function FileLineChart({ data, kind }: { data: TableStatistics[]; kind: "video" | "photo" }) {
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
                    label: kind === "video" ? "Videos" : "Images",
                    color: theme.vars?.palette.primary.main,
                    data: data.map(day => day[`file_len_${kind}`]),
                    highlightScope: { highlight: 'item' },
                    showMark: false,
                    curve: "monotoneX",
                },
                {
                    yAxisId: 'size',
                    label: 'Storage',
                    color: theme.vars?.palette.secondary.main,
                    data: data.map(day => day[`file_size_${kind}`]),
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
