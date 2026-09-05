import React from 'react';

import { AutoTextSize } from 'auto-text-size'

import {
    Box,
    Paper,
    Grid,
    Divider,
    Skeleton,
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

export function Card({ children }: { children: React.ReactNode }) {
    return (
        <Grid size={{ xs: 12, lg: 6 }}>
            <Paper elevation={3} sx={(theme) => ({
                borderRadius: 4,
                bgcolor: theme.vars?.palette.background.default,
                height: {
                    xs: `calc(50vh - 30px - ${theme.spacing(1.5)})`,
                    md: `calc(50vh - 40px - ${theme.spacing(4.5)})`,
                },
            })}>
                {children}
            </Paper>
        </Grid>
    )
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