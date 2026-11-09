import {
    Alert,
    Box,
    Button,
    Fab,
    Divider,
    LinearProgress,
    Typography,
} from "@mui/material";
import PlayCircleRoundedIcon from "@mui/icons-material/PlayCircleRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";

import { Link, useOutletContext } from "react-router";
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, Fragment, type ReactNode } from "react";

import { api } from "../../hooks/api";
import { pushError, pushMsg } from "~/components/error_popout";
import type { TableStatistics, ApiDeviceStatistics } from '../../model/status';
import type { ApiPlatformRegistration } from "~/model/api";

import { Card, CardGrid, StatisticCard } from '~/pages/dashboard/components';
import AppBar from "~/components/appbar";
import { FileLineChart, PostLineChart, ShowChart } from "~/pages/dashboard/linechart";
import { formatBytes, platformLabels, postCount } from "~/function/dashboard";
import { Platform } from "~/model/enum";
import { CardLayoutControl, useCardLayout } from "~/components/card_layout";
import ApiHealthCard from "./api-health-card";

const DASHBOARD_CARDS = [
    { id: "files-video", label: "Videos" },
    { id: "files-photo", label: "Images" },
    { id: "device", label: "Device information" },
    { id: "queue", label: "Queue Status" },
    { id: "api-health", label: "API Health" },
];


export default function Dashboard() {
    const { mobilDrawer } =
        useOutletContext<{
            appBarHeight: number,
            drawerWidth: number,
            mobilDrawer: () => void,
        }>();

    const catalog = useQuery({
        queryKey: ["api-catalog"],
        queryFn: () => api.get("/api/init/api/catalog").json<ApiPlatformRegistration[]>(),
        retry: false,
        refetchInterval: 30000,
    });
    const supportedPlatforms = Platform.filter(platform => catalog.data?.some(item => item.key === platform));
    const layout = useCardLayout("dashboard-cards:v1", [
        ...supportedPlatforms.map(platform => ({ id: `posts-${platform}`, label: `${platformLabels[platform]} posts` })),
        ...DASHBOARD_CARDS,
    ]);
    const [history, setHistory] = useState<TableStatistics[]>([]);
    const [today, setToday] = useState<TableStatistics>({
        post_len_douyin: 0,
        post_len_bilibili: 0,
        post_len_xhs: 0,
        post_len_x: 0,
        post_len_ins: 0,
        post_len_youtube: 0,
        file_len_video: 0,
        file_len_photo: 0,
        file_size_video: 0,
        file_size_photo: 0,
        date: "",
    });
    const deviceQuery = useQuery({
        queryKey: ["dashboard_device"],
        queryFn: () => api.get("/api/statistics/device").json<ApiDeviceStatistics>(),
        retry: false,
        refetchInterval: 18000,
        refetchIntervalInBackground: false,
    });
    const device = deviceQuery.data;

    useQuery({
        queryKey: ["dashboard_data"],
        queryFn: async () => {
            try {
                const tres = await api.get("/api/statistics/today").json<TableStatistics>();
                setToday(tres);
            }
            catch {
                pushMsg("Failed to refresh dashboard data.", "warning");
            }
            return null;
        },
        retry: 0,
        refetchInterval: 18000,
        refetchIntervalInBackground: false,
    });


    useEffect(() => {
        api.get("/api/statistics/all").json<TableStatistics[]>()
            .then((data) => setHistory(data))
            .catch((e) => pushError(e, "Failed to fetch all statistics"));
    }, []);


    const cards: Record<string, ReactNode> = {
        "device": (
            <Card>
                <Box sx={{
                    display: 'flex',
                    height: "100%",
                    width: "100%",
                }}>
                    <Box sx={{
                        display: 'flex',
                        width: "38.2%",
                        height: "100%",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        p: 3,
                    }}>
                        <Typography variant="h5" sx={{ fontWeight: "1000", }}>
                            Device Information
                        </Typography>
                        <Fab
                            variant="extended"
                            color="primary"
                            disabled
                            sx={{ mb: 8 }}
                        >
                            Check for Updates
                        </Fab>
                    </Box>
                    <Divider orientation="vertical" />
                    <Box sx={{
                        display: 'flex',
                        width: "61.8%",
                        height: "100%",
                        flexDirection: "column",
                        justifyContent: "space-between",
                    }}>
                        {[
                            ["OS", device?.os],
                            ["CPU", device?.cpu],
                            ["Memory", device?.memory],
                            ["Uptime", device?.uptime],
                            ["Version", device?.version]
                        ].map(([key, value]) => (
                            <Fragment key={key}>
                                <Box key={key} sx={{ height: "20%", display: "flex", alignItems: "center", pl: 3, }}>
                                    <Typography variant="body1">
                                        <b>{key}:</b> {value ?? "N/A"}
                                    </Typography>
                                </Box>
                                <Divider />
                            </Fragment>
                        ))}
                    </Box>
                </Box>
            </Card>
        ),
        "queue": (
            <Card>
                <Box sx={{ display: "flex", flexDirection: "column", height: "100%", gap: 1.5, p: { xs: 2, sm: 3 }, overflowY: "auto" }}>
                    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                        <Typography component="h2" sx={{ fontSize: { xs: "1rem", sm: "1.125rem" }, fontWeight: 700 }}>Queue Status</Typography>
                        <Button component={Link} to="/tasks" size="small">View tasks</Button>
                    </Box>
                    {deviceQuery.isPending && <LinearProgress aria-label="Loading queue status" />}
                    {deviceQuery.isError && <Alert severity="error" action={
                        <Button onClick={() => { void deviceQuery.refetch(); }}>Retry</Button>
                    }>Could not refresh queue status.</Alert>}
                    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1.5, flex: "1 0 auto" }}>
                        {[
                            { label: "Running", value: device?.queue_running, color: "primary.main", icon: <PlayCircleRoundedIcon fontSize="small" /> },
                            { label: "Pending", value: device?.queue_pending, color: "warning.main", icon: <ScheduleRoundedIcon fontSize="small" /> },
                            { label: "Failed", value: device?.queue_error, color: "error.main", icon: <ErrorRoundedIcon fontSize="small" /> },
                            { label: "Completed", value: device?.queue_success, color: "success.main", icon: <CheckCircleRoundedIcon fontSize="small" /> },
                        ].map(item => (
                            <Box key={item.label} sx={{ minWidth: 0, border: 1, borderColor: "divider", borderRadius: 2, p: { xs: 1, sm: 1.5 } }}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: item.color }}>
                                    {item.icon}
                                    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{item.label}</Typography>
                                </Box>
                                <Typography sx={{ mt: 0.5, fontSize: { xs: "1.375rem", sm: "1.75rem" }, fontWeight: 700, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>
                                    {item.value?.toLocaleString() ?? "—"}
                                </Typography>
                            </Box>
                        ))}
                    </Box>
                    <Typography variant="caption" color="text.secondary">Pending includes scheduled tasks.</Typography>
                </Box>
            </Card>
        ),
        "api-health": <ApiHealthCard />,
    };

    const chartData = [...history].reverse().concat(today.date ? [today] : []);
    for (const platform of supportedPlatforms) {
        const label = platformLabels[platform];
        cards[`posts-${platform}`] = (
            <StatisticCard title={label} metrics={[
                { label: "Posts", value: postCount(today, platform).toLocaleString() },
                { label: "Creators", value: today.creator_counts ? (today.creator_counts[platform] ?? 0).toLocaleString() : "—" },
            ]}>
                <ShowChart title={`${label} Post Statistics`}>
                    <PostLineChart data={chartData} platform={platform} />
                </ShowChart>
            </StatisticCard>
        );
    }
    for (const kind of ["video", "photo"] as const) {
        const label = kind === "video" ? "Videos" : "Images";
        cards[`files-${kind}`] = (
            <StatisticCard title={label} metrics={[
                { label: "Files", value: today[`file_len_${kind}`].toLocaleString() },
                { label: "Storage", value: formatBytes(today[`file_size_${kind}`]) },
            ]}>
                <ShowChart title={`${label} Statistics`}>
                    <FileLineChart data={chartData} kind={kind} />
                </ShowChart>
            </StatisticCard>
        );
    }

    return (
        <>
            <AppBar mobilDrawer={mobilDrawer} label="Dashboard" button={
                <CardLayoutControl layout={layout} label="Customize dashboard" disabled={!catalog.isSuccess} />
            } />
            <Box sx={{ p: { xs: 1, md: 3 } }}>
                {catalog.isPending && <LinearProgress aria-label="Loading supported platforms" sx={{ mb: 2 }} />}
                {catalog.isError && <Alert severity="error" sx={{ mb: 2 }} action={
                    <Button onClick={() => { void catalog.refetch(); }}>Retry</Button>
                }>Could not load supported platforms.</Alert>}
                {layout.visibleIds.length === 0 && <Alert severity="info">
                    All cards are hidden. Use Customize dashboard to show cards again.
                </Alert>}
                <CardGrid>
                    {layout.visibleIds.map(id => <Fragment key={id}>{cards[id]}</Fragment>)}
                </CardGrid>
            </Box>
        </>
    );
}
