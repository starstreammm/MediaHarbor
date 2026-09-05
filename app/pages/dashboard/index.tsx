import {
    Box,
    Fab,
    Grid,
    Divider,
    Typography,
    Tooltip,
} from "@mui/material";
import InfoOutlineRoundedIcon from '@mui/icons-material/InfoOutlineRounded';
import NotInterestedRoundedIcon from '@mui/icons-material/NotInterestedRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';

import { useOutletContext } from "react-router";
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, Fragment } from "react";

import { api } from "../../hooks/api";
import { useStatus } from "../../hooks/status";
import { pushError, pushMsg } from "~/components/error_popout";
import type { TableStatistics, ApiDeviceStatistics } from '../../model/status';

import { Card, DataTable } from '~/pages/dashboard/components';
import AppBar from "~/components/appbar";
import { FileLineChart, PostLineChart, ShowChart } from "~/pages/dashboard/linechart";
import { formatBytes } from "~/function/dashboard";


export default function Dashboard() {
    const { mobilDrawer } =
        useOutletContext<{
            appBarHeight: number,
            drawerWidth: number,
            mobilDrawer: () => void,
        }>();

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
    const [device, setDevice] = useState<ApiDeviceStatistics>();
    const { api_status } = useStatus().data || {};

    useQuery({
        queryKey: ["dashboard_data"],
        queryFn: async () => {
            try {
                const tres = await api.get("/api/statistics/today").json<TableStatistics>();
                setToday(tres);
                const dres = await api.get("/api/statistics/device").json<ApiDeviceStatistics>();
                setDevice(dres);
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


    const calPostTotal = (day: TableStatistics) => {
        return Object.entries(day)
            .filter(([key]) => key.startsWith("post_len_"))
            .reduce((acc, [_, value]) => acc + value, 0);
    }
    const calFileTotal = (day: TableStatistics, len: boolean) => {
        return len
            ? day.file_len_photo + day.file_len_video
            : day.file_size_photo + day.file_size_video;
    }

    useEffect(() => {
        api.get("/api/statistics/all").json<TableStatistics[]>()
            .then((data) => setHistory(data))
            .catch((e) => pushError(e, "Failed to fetch all statistics"));
    }, []);


    return (
        <>
            <AppBar mobilDrawer={mobilDrawer} label="Dashboard" button={null} />
            <Grid container spacing={{ xs: 1, md: 3 }} sx={{ m: { xs: 1, md: 3 } }}>
                <Card>
                    <Box sx={{
                        display: 'flex',
                        height: "38%",
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'space-evenly',
                    }}>
                        <DataTable width='34%' title={["Posts"]} data={[`Total: ${calPostTotal(today)}`]} />
                        <Divider orientation='vertical' flexItem />
                        <DataTable width='22%' title={["Douyin", "X"]} data={[String(today.post_len_douyin), String(today.post_len_x)]} />
                        <Divider orientation='vertical' flexItem />
                        <DataTable width='22%' title={["Bilibili", "Ins"]} data={[String(today.post_len_bilibili), String(today.post_len_ins)]} />
                        <Divider orientation='vertical' flexItem />
                        <DataTable width='22%' title={["XHS", "Youtube"]} data={[String(today.post_len_xhs), String(today.post_len_youtube)]} />
                    </Box>
                    <Divider flexItem />
                    <ShowChart title="Post Statistics Details" height="62%">
                        <PostLineChart data={[today, ...history].reverse()} />
                    </ShowChart>
                </Card>
                <Card>
                    <Box sx={{
                        display: 'flex',
                        height: "38%",
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'space-evenly',
                    }}>
                        <DataTable width='38%' title={["Files"]} data={[`Total: ${calFileTotal(today, true)}/${formatBytes(calFileTotal(today, false))}`]} />
                        <Divider orientation='vertical' flexItem />
                        <DataTable width='31%' title={["Video"]} data={[`${today.file_len_video}/${formatBytes(today.file_size_video)}`]} />
                        <Divider orientation='vertical' flexItem />
                        <DataTable width='31%' title={["Photo"]} data={[`${today.file_len_photo}/${formatBytes(today.file_size_photo)}`]} />
                    </Box>
                    <Divider flexItem />
                    <ShowChart title="File Statistics Details" height="62%">
                        <FileLineChart data={[today, ...history].reverse()} />
                    </ShowChart>
                </Card>
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
                <Card>
                    <Box sx={{
                        display: 'flex',
                        height: "100%",
                        width: "100%",
                        flexDirection: "row",
                    }}>
                        <Box sx={{
                            display: 'flex',
                            height: "100%",
                            width: "60%",
                            flexDirection: "column",
                            pt: 2,
                            pl: 1.5,
                        }}>
                            <Typography variant="h5" sx={{ fontWeight: "1000", }}>
                                Plateform Support
                            </Typography>
                            <Box sx={{
                                display: 'flex',
                                height: "100%",
                                width: "100%",
                                flexDirection: "column",
                                justifyContent: "space-evenly",
                            }}>
                                {([
                                    ["Douyin", api_status?.douyin],
                                    ["Bilibili", api_status?.bilibili],
                                    ["XHS", api_status?.xhs],
                                    ["X", api_status?.x],
                                    ["Instagram", api_status?.ins],
                                    ["YouTube", api_status?.youtube],
                                ] as [string, boolean | undefined | null][]).map(([name, stat]) => (
                                    <Box key={name} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                        {stat === null || stat === undefined ?
                                            <NotInterestedRoundedIcon color="disabled" />
                                            : stat === false
                                                ? <Tooltip title="The cookie is updated 30 days ago. Please update it, or its stability will decline.">
                                                    <ErrorRoundedIcon color="warning" />
                                                </Tooltip>
                                                : <CheckCircleRoundedIcon color="success" />
                                        }
                                        <Typography variant="subtitle1">
                                            {name}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                        <Divider orientation="vertical" />
                        <Box sx={{
                            display: 'flex',
                            height: "100%",
                            width: "40%",
                            flexDirection: "column",
                            pt: 2,
                            pl: 1.5,
                        }}>
                            <Typography variant="h5" sx={{ fontWeight: "1000", }}>
                                Queue Status
                            </Typography>
                            <Box sx={{
                                display: 'flex',
                                height: "100%",
                                width: "100%",
                                flexDirection: "column",
                                justifyContent: "space-evenly",
                            }}>
                                {([
                                    ["Running", device?.queue_running],
                                    ["Pending", device?.queue_pending],
                                    ["Error", device?.queue_error],
                                    ["Success", device?.queue_success],
                                ] as [string, number | undefined][]).map(([name, stat]) => (
                                    <Box key={name} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                        <InfoOutlineRoundedIcon color="info" />
                                        <Typography variant="subtitle1">
                                            <b>{name}</b>: {stat ?? "N/A"}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    </Box>
                </Card>
            </Grid >
        </>
    )
}