import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Fab from "@mui/material/Fab";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { LineChart } from "@mui/x-charts/LineChart";

import { api } from "~/hooks/api";

interface SyncDetails {
    uid: number;
    enabled: boolean;
    checked_at: string | null;
    next_check_at: string | null;
    latest_post_at: string | null;
    sync_active: boolean;
    failures: number;
    error: string | null;
    observed_posts: number;
    downloads: { status: string; count: number }[];
    prediction: {
        calculated_at: string;
        observed_through: string;
        sample_count: number;
        prior_source: string;
        prior_accounts: number;
        median_at: string | null;
        horizon_days: number;
        distribution: { at: string; probability: number }[];
        reason: string;
        models: { name: string; weight: number }[];
        warnings: string[];
    } | null;
}

function date(value: string | null) {
    return value ? new Date(value).toLocaleString() : "Not available";
}

export default function SyncDetailsDialog({ uid, onClose }: {
    uid: number;
    onClose: () => void;
}) {
    const [showReason, setShowReason] = useState(false);
    const [chartOpen, setChartOpen] = useState(false);
    const query = useQuery({
        queryKey: ["account-sync-details", uid],
        queryFn: ({ signal }) => api.get("/api/account/sync/details", {
            searchParams: { uid }, signal,
        }).json<SyncDetails>(),
        retry: false,
        refetchInterval: 15000,
    });
    const details = query.data;
    const prediction = details?.prediction;
    const observedAt = prediction ? new Date(prediction.observed_through).getTime() : 0;
    const distribution = prediction?.distribution.filter((point) => new Date(point.at).getTime() >= observedAt + 8 * 3600000);
    const plotTimes = distribution?.map((point) => (new Date(point.at).getTime() - observedAt) / 3600000) ?? [];
    const plotTicks = [0, 1 / 3, 2 / 3, 1].map((fraction) => plotTimes[Math.round(fraction * (plotTimes.length - 1))]);

    const chart = distribution?.length ? (
        <LineChart
            skipAnimation
            hideLegend
            xAxis={[{
                data: plotTimes,
                scaleType: "log",
                min: 8,
                max: plotTimes[plotTimes.length - 1],
                tickInterval: plotTicks,
                valueFormatter: (value: number, context) => {
                    const time = new Date(observedAt + value * 3600000);
                    return context.location === "tooltip"
                        ? time.toLocaleString()
                        : time.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                },
                tickLabelStyle: { fontSize: 10 },
                height: 30,
            }]}
            yAxis={[{ min: 0, max: 100, width: 48, valueFormatter: (value: number) => `${value}%` }]}
            series={[{
                data: distribution.map((point) => point.probability * 100),
                label: "Published by this time",
                valueFormatter: (value) => value === null ? "" : `${value.toFixed(1)}%`,
                showMark: false,
                area: true,
                curve: "linear",
            }]}
            margin={{ top: 10, right: 12, bottom: 10, left: 0 }}
        />
    ) : null;

    return (
        <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="sync-details-title">
            <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                <Box component="span" sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                    <Typography component="span" variant="h6" id="sync-details-title" sx={{ fontWeight: 700 }}>Sync Details</Typography>
                    {details ? <Chip size="small" label={details.enabled ? "Automatic sync on" : "Automatic sync off"} color={details.enabled ? "success" : "default"} variant="outlined" /> : null}
                </Box>
                <Fab size="small" onClick={onClose} aria-label="Close sync details" sx={{ flexShrink: 0 }}>
                    <CloseRoundedIcon />
                </Fab>
            </DialogTitle>
            <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, py: 3, scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}>
                <Stack spacing={3}>
                    {query.isPending ? <CircularProgress size={24} aria-label="Loading sync details" /> : null}
                    {query.isError ? <Alert severity="error">Unable to load sync details. {query.error.message}</Alert> : null}
                    {details ? (
                        <>
                            <Box>
                                <Table size="small" aria-label="Account sync information" sx={{
                                    "& th, & td": { px: 0, py: 1.25, verticalAlign: "top" },
                                    "& th": { color: "text.secondary", width: "43%", pr: 2, fontWeight: 400 },
                                    "& td": { textAlign: "right", overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" },
                                    "& tr:last-child > *": { borderBottom: 0 },
                                }}>
                                    <TableBody>
                                        {[
                                            ["Next automatic check", !details.enabled ? "Off" : details.sync_active ? "Check already queued or running" : details.next_check_at ? date(details.next_check_at) : "Awaiting scheduling"],
                                            ["Last verified check", date(details.checked_at)],
                                            ["Latest observed post", date(details.latest_post_at)],
                                            ["Posts observed", details.observed_posts.toLocaleString()],
                                            ["Consecutive failures", String(details.failures)],
                                            ...(details.downloads.length ? [["Download jobs", details.downloads.map((item) => `${item.count} ${item.status}`).join(" · ")]] : []),
                                        ].map(([label, value]) => (
                                            <TableRow key={label}>
                                                <TableCell component="th" scope="row">{label}</TableCell>
                                                <TableCell>{value}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Box>
                            {details.error ? <Alert severity="error">{details.error}</Alert> : null}
                            {details.failures > 0 && details.enabled ? (
                                <Alert severity="info">The next check follows the retry schedule. Failed requests do not confirm that no new post appeared.</Alert>
                            ) : null}
                            {prediction ? (
                                <>
                                    <Box sx={{ p: { xs: 1.5, sm: 2.5 }, borderRadius: 2, bgcolor: "action.hover" }}>
                                        <Typography variant="overline" color="text.secondary">Next-post forecast · median</Typography>
                                        <Typography variant="h6" sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums" }}>
                                            {prediction.median_at ? date(prediction.median_at) : `Beyond ${prediction.horizon_days} days after the verified check`}
                                        </Typography>
                                        {distribution?.length ? (
                                            <>
                                                <Box
                                                    role="button"
                                                    tabIndex={0}
                                                    aria-label="Open next-post forecast in fullscreen"
                                                    aria-haspopup="dialog"
                                                    onClick={() => setChartOpen(true)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === "Enter" || event.key === " ") {
                                                            event.preventDefault();
                                                            setChartOpen(true);
                                                        }
                                                    }}
                                                    sx={{ mt: 1, minWidth: 0, height: 250, cursor: "pointer" }}
                                                >
                                                    {chart}
                                                </Box>
                                                <Dialog open={chartOpen} onClose={() => setChartOpen(false)} fullScreen aria-labelledby="sync-forecast-title">
                                                    <DialogTitle id="sync-forecast-title" sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, fontWeight: 700 }}>
                                                        Next-post forecast
                                                        <Fab size="small" onClick={() => setChartOpen(false)} aria-label="Close fullscreen forecast" sx={{ flexShrink: 0 }}>
                                                            <CloseRoundedIcon />
                                                        </Fab>
                                                    </DialogTitle>
                                                    <DialogContent dividers sx={{ p: { xs: 1, sm: 3 }, minHeight: 0, overflow: "hidden" }}>
                                                        {chart}
                                                    </DialogContent>
                                                </Dialog>
                                            </>
                                        ) : null}
                                    </Box>
                                    <Box sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}>
                                        <Button
                                            onClick={() => setShowReason((value) => !value)}
                                            aria-expanded={showReason}
                                            aria-controls="sync-forecast-reason"
                                            endIcon={showReason ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                                        >
                                            How this forecast was calculated
                                        </Button>
                                        <Collapse in={showReason} id="sync-forecast-reason">
                                            <Stack spacing={2.5} sx={{
                                                pt: 1.5,
                                                "& code": { px: 0.5, py: 0.125, borderRadius: 0.5, bgcolor: "action.hover", fontSize: "0.9em", overflowWrap: "anywhere" },
                                            }}>
                                                <Stack spacing={0.75}>
                                                    <Typography component="h3" variant="subtitle2" sx={{ fontWeight: 700 }}>Reading the forecast</Typography>
                                                    <Typography variant="body2"><strong>Starting point:</strong> the last verified check at <code>{date(prediction.observed_through)}</code>.</Typography>
                                                    <Typography variant="body2"><strong>The curve</strong> shows the cumulative chance that a new post has appeared by each date. The <strong>median</strong> marks the <code>50%</code> probability point.</Typography>
                                                    <Typography variant="body2" color="text.secondary"><em>This is an estimate, not a promised publication time. A post may already have appeared since the last check.</em></Typography>
                                                </Stack>
                                                <Stack spacing={0.75}>
                                                    <Typography component="h3" variant="subtitle2" sx={{ fontWeight: 700 }}>When the next check happens</Typography>
                                                    <Typography variant="body2">Automatic checks target a <code>63%</code> chance of a new post, within a <code>13-minute–30-day</code> window.</Typography>
                                                    <Typography variant="body2"><strong>Current recommendation:</strong> {prediction.reason}.</Typography>
                                                    <Typography variant="body2" color="text.secondary">The <strong>Next automatic check</strong> row shows the saved schedule, including any retry delay. Opening this forecast does not reschedule it.</Typography>
                                                </Stack>
                                                <Stack spacing={0.75}>
                                                    <Typography component="h3" variant="subtitle2" sx={{ fontWeight: 700 }}>Data behind the estimate</Typography>
                                                    <Box component="dl" sx={{
                                                        m: 0,
                                                        display: "grid",
                                                        gridTemplateColumns: "auto minmax(0, 1fr)",
                                                        columnGap: 2,
                                                        rowGap: 0.75,
                                                        "& dt": { fontWeight: 600 },
                                                        "& dd": { m: 0 },
                                                    }}>
                                                        <Typography component="dt" variant="body2">Calculated</Typography>
                                                        <Typography component="dd" variant="body2"><code>{date(prediction.calculated_at)}</code></Typography>
                                                        <Typography component="dt" variant="body2">History</Typography>
                                                        <Typography component="dd" variant="body2"><code>{prediction.sample_count}</code> distinct posting times</Typography>
                                                        <Typography component="dt" variant="body2">Prior source</Typography>
                                                        <Typography component="dd" variant="body2"><code>{prediction.prior_source}</code>{prediction.prior_accounts ? ` (${prediction.prior_accounts} accounts)` : ""}</Typography>
                                                    </Box>
                                                    <Typography variant="body2"><strong>Model weights</strong> — each model’s share of the combined forecast:</Typography>
                                                    <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                                                        {prediction.models.map((model) => (
                                                            <Typography component="li" variant="body2" key={model.name} sx={{ py: 0.25 }}>
                                                                <code>{model.name}</code>: <strong>{(model.weight * 100).toFixed(0)}%</strong>
                                                            </Typography>
                                                        ))}
                                                    </Box>
                                                </Stack>
                                                <Stack spacing={0.75}>
                                                    <Typography component="h3" variant="subtitle2" sx={{ fontWeight: 700 }}>Chart range and time zones</Typography>
                                                    <Typography variant="body2" color="text.secondary"><strong>Date spacing is logarithmic:</strong> equal distances represent larger time intervals further to the right. The plot starts <code>8 hours</code> after the verified check; its probabilities still include the first eight hours.</Typography>
                                                    <Typography variant="body2" color="text.secondary">The plot covers at least <code>24 hours</code>, then extends to <code>95%</code> cumulative probability or the <code>{prediction.horizon_days}-day</code> forecast limit. Any probability beyond that range remains part of the estimate.</Typography>
                                                    <Typography variant="body2" color="text.secondary">Dates use <strong>your browser’s time zone</strong>. Calendar patterns are modeled in <code>UTC</code>.</Typography>
                                                </Stack>
                                                {prediction.warnings.map((warning) => <Alert severity="warning" key={warning}>{warning}</Alert>)}
                                            </Stack>
                                        </Collapse>
                                    </Box>
                                </>
                            ) : (
                                <Alert severity="info">A complete successful listing is needed before a forecast is available.</Alert>
                            )}
                        </>
                    ) : null}
                </Stack>
            </DialogContent>
        </Dialog>
    );
}
