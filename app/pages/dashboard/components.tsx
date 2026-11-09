import React from 'react';

import { AutoTextSize } from 'auto-text-size'

import {
    Box,
    Paper,
    Grid,
    Divider,
    Skeleton,
    Typography,
} from "@mui/material";

function TextBox({ children, height }: { children: React.ReactNode, height: string }) {
    return (
        <Box
            sx={{
                height: height,
                width: '100%',
                px: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
            }}
        >
            {children}
        </Box>
    )
}

export function CardGrid({ children }: { children: React.ReactNode }) {
    return <Grid container spacing={{ xs: 1, md: 3 }} sx={{ alignItems: "flex-start" }}>{children}</Grid>;
}

export function Card({ children, autoHeight = false }: { children: React.ReactNode; autoHeight?: boolean }) {
    return (
        <Grid size={{ xs: 12, lg: 6 }} sx={{ minWidth: 0 }}>
            <Paper elevation={3} sx={(theme) => ({
                borderRadius: 4,
                bgcolor: theme.vars?.palette.background.default,
                overflow: "hidden",
                height: autoHeight ? "auto" : {
                    xs: `calc(50vh - 30px - ${theme.spacing(1.5)})`,
                    md: `calc(50vh - 40px - ${theme.spacing(4.5)})`,
                },
            })}>
                {children}
            </Paper>
        </Grid>
    )
}

export function StatisticCard({ title, metrics, children }: {
    title: string;
    metrics: { label: string; value: string }[];
    children: React.ReactNode;
}) {
    return (
        <Card>
            <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
                <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, px: { xs: 2, sm: 3 }, py: 1.5, flexShrink: 0 }}>
                    <Typography component="h2" sx={{ flex: "1 1 5rem", minWidth: 0, fontSize: { xs: "1rem", sm: "1.125rem" }, fontWeight: 700, overflowWrap: "anywhere" }}>
                        {title}
                    </Typography>
                    <Box component="dl" sx={{ m: 0, flex: "2 1 12rem", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 2 }}>
                        {metrics.map(metric => (
                            <Box key={metric.label} sx={{ minWidth: 0 }}>
                                <Typography component="dt" variant="body2" color="text.secondary">{metric.label}</Typography>
                                <Typography component="dd" sx={{ m: 0, fontSize: { xs: "1.125rem", sm: "1.375rem" }, fontWeight: 700, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>
                                    {metric.value}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                </Box>
                <Divider />
                <Box sx={{ flex: "1 0 7.5rem", minWidth: 0, px: 1, pt: 1, pb: 0.5 }}>
                    {children}
                </Box>
            </Box>
        </Card>
    );
}

export function DataTable(
    { width, title, data }: {
        width: string,
        title: string[],
        data: string[]
    }) {
    const len = title.length;
    if (title.length !== data.length)
        return;
    else if (len === 1)
        return (
            <Box
                sx={{
                    width: width,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    flexDirection: 'column',
                    justifyContent: 'space-evenly',
                    py: { xs: 0.2, md: 0.8 }
                }}
            >
                <TextBox height="50%">
                    <AutoTextSize mode='boxoneline'> <b>{title[0]}</b> </AutoTextSize>
                </TextBox>
                <Divider orientation='horizontal' variant='middle' flexItem />
                <TextBox height="50%">
                    <AutoTextSize mode='boxoneline'> {data[0]} </AutoTextSize>
                </TextBox>
            </Box>
        )
    else if (len === 2)
        return (
            <Box
                sx={{
                    width: width,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    flexDirection: 'column',
                    justifyContent: 'space-eventy',
                    py: { xs: 0.2, md: 0.8 }
                }}
            >
                <TextBox height="28%">
                    <AutoTextSize mode='boxoneline'> <b>{title[0]}</b> </AutoTextSize>
                </TextBox>
                <Divider orientation='horizontal' variant='middle' flexItem />
                <TextBox height="22%">
                    <AutoTextSize mode='boxoneline'> {data[0]} </AutoTextSize>
                </TextBox>
                <Divider orientation='horizontal' flexItem />
                <TextBox height="28%">
                    <AutoTextSize mode='boxoneline'> <b>{title[1]}</b> </AutoTextSize>
                </TextBox>
                <Divider orientation='horizontal' variant='middle' flexItem sx={{ my: 0.3 }} />
                <TextBox height="22%">
                    <AutoTextSize mode='boxoneline'> {data[1]} </AutoTextSize>
                </TextBox>
            </Box>
        )
    else
        return;
}

export function DashboardSkeleton(width: string, height: string) {
    return (
        <>
            <Skeleton variant="rounded" width={width} height={height} />
        </>
    )
}
