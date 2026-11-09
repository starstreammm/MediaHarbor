import { useState } from "react";
import { useOutletContext } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    FormControlLabel,
    IconButton,
    LinearProgress,
    Paper,
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    Tooltip,
    useTheme,
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import { LineChart } from "@mui/x-charts/LineChart";
import { PieChart } from "@mui/x-charts/PieChart";
import HealthHeader from "./header";
import GuestSettingsDialog from "./guest-settings-dialog";
import { CardLayoutControl, useCardLayout } from "~/components/card_layout";
import { Card, CardGrid } from "~/pages/dashboard/components";
import { pushError, pushMsg } from "~/components/error_popout";
import { api } from "~/hooks/api";
import type {
    HealthStatus,
    HistoryBucket,
    IntegrationService,
    RequestStats,
    ServiceConfig,
} from "~/model/integration";
import CredentialsDialog from "./credentials-dialog";
import Accounts from "./accounts";

const base = "/api/integrations";
const CHART_CARDS = [
    { id: "volume", label: "Request volume" },
    { id: "results", label: "Success and failure trends" },
    { id: "latency", label: "Average response latency" },
    { id: "health", label: "Current platform health" },
];
const statuses: HealthStatus[] = [
    "Healthy",
    "Partial",
    "Degraded",
    "Login Required",
    "Expired",
    "Error",
    "Unavailable",
    "Unknown",
    "Disabled",
];
const statusColors = {
    Healthy: "success",
    Partial: "warning",
    Degraded: "warning",
    "Login Required": "warning",
    Expired: "warning",
    Error: "error",
    Unavailable: "error",
    Unknown: "default",
    Disabled: "default",
} as const;

function StatusChip({ status }: { status: HealthStatus }) {
    return <Chip size="small" label={status} color={statusColors[status]} />;
}

function date(value?: string | null) {
    return value ? new Date(value).toLocaleString() : "Never";
}

function latency(value?: number | null) {
    return value == null ? "—" : `${value.toFixed(0)} ms`;
}

function configOf(service: ServiceConfig): ServiceConfig {
    return {
        name: service.name,
        kind: service.kind,
        base_url: service.base_url,
        transport: service.transport,
        platform: service.platform,
        options: service.options,
        enabled: service.enabled,
        interval_seconds: service.interval_seconds,
        timeout_seconds: service.timeout_seconds,
        auth_type: service.auth_type,
        credential_expires_at: service.credential_expires_at,
        auth_check_endpoint: service.auth_check_endpoint,
        endpoints: service.endpoints.map(
            ({
                key,
                name,
                path,
                platform,
                requires_auth,
                enabled,
                probe_enabled,
                probe_params,
            }) => ({
                key,
                name,
                path,
                platform,
                requires_auth,
                enabled,
                probe_enabled,
                probe_params,
            }),
        ),
    };
}

function Stats({ data }: { data: RequestStats }) {
    return (
        <Stack spacing={0.5}>
            <Typography variant="body2">
                {data.total.toLocaleString()} requests ·{" "}
                {data.successful.toLocaleString()} successful ·{" "}
                {data.failed.toLocaleString()} failed
            </Typography>
            <Typography variant="body2" color="text.secondary">
                Success rate:{" "}
                {data.success_rate == null
                    ? "—"
                    : `${data.success_rate.toFixed(1)}%`}{" "}
                · Average: {latency(data.average_latency_ms)} · Latest:{" "}
                {latency(data.latency_ms)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
                Last check: {date(data.last_check)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
                Last success: {date(data.last_success)} · Last request:{" "}
                {date(data.last_request)}
            </Typography>
            {data.most_recent_error && (
                <Typography variant="caption" color="error.main">
                    Most recent error: {data.most_recent_error}
                </Typography>
            )}
        </Stack>
    );
}

function IdentityPool({ service }: { service: IntegrationService }) {
    const pool = service.identity_pool;
    if (!pool) {
        return (
            <Typography variant="caption" color="text.secondary">
                Guest identity pool: Not applicable
            </Typography>
        );
    }
    return (
        <Stack
            spacing={0.5}
            sx={{ borderTop: 1, borderColor: "divider", pt: 1 }}
        >
            <Stack
                direction="row"
                spacing={1}
                useFlexGap
                sx={{ alignItems: "center", flexWrap: "wrap" }}
            >
                <Typography variant="subtitle2">Guest identity pool</Typography>
                <Chip
                    size="small"
                    variant="outlined"
                    label={pool.health}
                    color={
                        pool.health === "Healthy"
                            ? "success"
                            : pool.health === "Degraded"
                              ? "warning"
                              : "error"
                    }
                />
                <Typography variant="caption" color="text.secondary">
                    {pool.replenishment ?? "Unavailable"}
                </Typography>
            </Stack>
            {pool.total != null && (
                <Typography variant="body2">
                    {pool.total} total · {pool.available} available /{" "}
                    {pool.active} active · {pool.cooling} cooling ·{" "}
                    {pool.unusable} degraded / unusable
                </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
                Minimum {pool.minimum_size ?? "—"} · Target{" "}
                {pool.target_size ?? "—"} · Last generated:{" "}
                {date(pool.last_success_at)}
            </Typography>
            {(pool.replenishment === "Backing off" ||
                pool.replenishment === "Pending") && (
                <Typography variant="caption" color="text.secondary">
                    Next generation attempt: {date(pool.next_attempt_at)}
                </Typography>
            )}
            {pool.error && (
                <Typography variant="caption" color="error.main">
                    {pool.error}
                </Typography>
            )}
            {pool.recent_errors?.slice(-2).map((error, index) => (
                <Typography
                    key={`${error.at}-${index}`}
                    variant="caption"
                    color="error.main"
                >
                    {date(error.at)}: {error.message}
                </Typography>
            ))}
        </Stack>
    );
}

export default function ApiHealth() {
    const { mobilDrawer } = useOutletContext<{ mobilDrawer: () => void }>();
    const theme = useTheme();
    const queryClient = useQueryClient();
    const [range, setRange] = useState("24h");
    const [details, setDetails] = useState<number | null>(null);
    const [guestSettingsOpen, setGuestSettingsOpen] = useState(false);
    const [serviceFilter, setServiceFilter] = useState("all");
    const [source, setSource] = useState("all");
    const [deleting, setDeleting] = useState<IntegrationService | null>(null);
    const [reauthenticating, setReauthenticating] =
        useState<IntegrationService | null>(null);
    const chartLayout = useCardLayout("api-health-charts:v1", CHART_CARDS);

    const services = useQuery({
        queryKey: ["api-health", "services"],
        queryFn: () => api.get(`${base}/services`).json<IntegrationService[]>(),
        refetchInterval: 30000,
        retry: false,
    });
    const history = useQuery({
        queryKey: ["api-health", "history", range, serviceFilter, source],
        queryFn: () =>
            api
                .get(`${base}/history`, {
                    searchParams: {
                        range,
                        source,
                        ...(serviceFilter === "all"
                            ? {}
                            : { service_uid: serviceFilter }),
                    },
                })
                .json<HistoryBucket[]>(),
        refetchInterval: 30000,
        retry: false,
    });
    const action = useMutation({
        mutationFn: (run: () => Promise<unknown>) => run(),
        onSuccess: () =>
            queryClient.invalidateQueries({ queryKey: ["api-health"] }),
        onError: (error) => pushError(error, "API Health"),
    });
    const run = (operation: () => Promise<unknown>, message: string) => {
        action.mutate(operation, {
            onSuccess: () => pushMsg(message, "success"),
        });
    };
    const check = (uid: number, endpoint?: string) => {
        action.mutate(async () => {
            const result = await api
                .post(
                    `${base}/services/${uid}${endpoint ? `/endpoints/${endpoint}` : ""}/check`,
                    { timeout: 180000 },
                )
                .json<{ checked: number; failed: number }>();
            pushMsg(
                `${result.checked} endpoint(s) checked; ${result.failed} failed.`,
                result.failed ? "warning" : "success",
            );
        });
    };

    const allServices = services.data ?? [];
    const serviceLayout = useCardLayout(
        "api-health-services:v1",
        allServices.map((service) => ({
            id: String(service.uid),
            label: service.name,
        })),
    );
    const servicesById = new Map(
        allServices.map((service) => [String(service.uid), service]),
    );
    const visibleServices = serviceLayout.visibleIds.flatMap((id) => {
        const service = servicesById.get(id);
        return service ? [service] : [];
    });
    const buckets = history.data ?? [];
    const chartColors = {
        Healthy: theme.palette.success.main,
        Partial: theme.palette.warning.main,
        Degraded: theme.palette.warning.dark,
        "Login Required": theme.palette.warning.main,
        Expired: theme.palette.warning.main,
        Error: theme.palette.error.main,
        Unavailable: theme.palette.error.dark,
        Unknown: theme.palette.text.secondary,
        Disabled: theme.palette.action.disabled,
    };
    const distribution = statuses
        .map((status) => ({
            id: status,
            label: status,
            value: allServices.filter((service) => service.status === status)
                .length,
            color: chartColors[status],
        }))
        .filter((item) => item.value > 0);
    const xAxis = [
        {
            data: buckets.map((bucket) => new Date(bucket.time)),
            scaleType: "time" as const,
            valueFormatter: (value: Date) =>
                range === "7d"
                    ? value.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                      })
                    : value.toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                      }),
        },
    ];
    const charts = {
        volume: {
            title: "Request volume",
            series: [
                {
                    label: "Requests",
                    data: buckets.map((bucket) => bucket.total),
                    color: theme.palette.primary.main,
                },
            ],
        },
        results: {
            title: "Success and failure trends",
            series: [
                {
                    label: "Successful",
                    data: buckets.map((bucket) => bucket.successful),
                    color: theme.palette.success.main,
                },
                {
                    label: "Failed",
                    data: buckets.map((bucket) => bucket.failed),
                    color: theme.palette.error.main,
                },
            ],
        },
        latency: {
            title: "Average response latency",
            series: [
                {
                    label: "Latency (ms)",
                    data: buckets.map((bucket) => bucket.average_latency_ms),
                    color: theme.palette.secondary.main,
                },
            ],
        },
    };

    return (
        <>
            <HealthHeader
                mobilDrawer={mobilDrawer}
                services={allServices}
                range={range} onRange={setRange}
                serviceFilter={serviceFilter} onService={setServiceFilter}
                source={source} onSource={setSource}
                onSettings={() => setGuestSettingsOpen(true)}
            >
                <CardLayoutControl layout={chartLayout} label="Customize monitoring cards" />
            </HealthHeader>
            <Stack spacing={3} sx={{ p: { xs: 1, md: 3 } }}>
                {(services.isFetching ||
                    history.isFetching ||
                    action.isPending) && (
                    <LinearProgress aria-label="Updating API Health" />
                )}
                {services.isError && (
                    <Alert severity="error">
                        Could not load platforms. Check the backend
                        connection and database initialization.
                    </Alert>
                )}
                {history.isError && (
                    <Alert severity="error">
                        Could not load request history. Refresh to try again.
                    </Alert>
                )}
                {chartLayout.visibleIds.length === 0 && (
                    <Typography color="text.secondary">
                        All monitoring cards are hidden. Use Customize
                        monitoring cards to show them again.
                    </Typography>
                )}
                <CardGrid>
                    {chartLayout.visibleIds.map((id) => {
                        if (id === "health") {
                            return (
                                <Card key={id}>
                                    <Stack
                                        spacing={2}
                                        sx={{
                                            p: { xs: 2, md: 3 },
                                            height: "100%",
                                        }}
                                    >
                                        <Typography
                                            variant="h5"
                                            sx={{ fontWeight: "1000" }}
                                        >
                                            Current health · all services
                                        </Typography>
                                        <Box sx={{ flex: 1, minHeight: 0 }}>
                                            {services.isPending ? (
                                                <LinearProgress />
                                            ) : services.isError ? (
                                                <Typography color="text.secondary">
                                                    Service health unavailable
                                                </Typography>
                                            ) : (
                                                <PieChart
                                                    series={[
                                                        {
                                                            data: distribution,
                                                            innerRadius: 50,
                                                        },
                                                    ]}
                                                />
                                            )}
                                        </Box>
                                    </Stack>
                                </Card>
                            );
                        }
                        const chart = charts[id as keyof typeof charts];
                        return (
                            <Card key={id}>
                                <Stack
                                    spacing={2}
                                    sx={{ p: { xs: 2, md: 3 }, height: "100%" }}
                                >
                                    <Typography
                                        variant="h5"
                                        sx={{ fontWeight: "1000" }}
                                    >
                                        {chart.title}
                                    </Typography>
                                    <Box sx={{ flex: 1, minHeight: 0 }}>
                                        {history.isPending ? (
                                            <LinearProgress />
                                        ) : history.isError ? (
                                            <Typography color="text.secondary">
                                                History unavailable
                                            </Typography>
                                        ) : (
                                            <LineChart
                                                xAxis={xAxis}
                                                series={chart.series.map(
                                                    (series) => ({
                                                        ...series,
                                                        showMark: false,
                                                        curve: "linear",
                                                    }),
                                                )}
                                                yAxis={[{ min: 0 }]}
                                            />
                                        )}
                                    </Box>
                                </Stack>
                            </Card>
                        );
                    })}
                </CardGrid>
                {services.isSuccess && !allServices.length && (
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6">
                            No platforms initialized
                        </Typography>
                        <Typography color="text.secondary">
                            Start the built-in platforms on the initialization page
                            to begin monitoring.
                        </Typography>
                    </Paper>
                )}
                <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center" }}
                >
                    <Typography variant="h6" sx={{ flex: 1 }}>Platforms</Typography>
                    <CardLayoutControl
                        layout={serviceLayout}
                        label="Customize platform cards"
                        disabled={!services.isSuccess || !allServices.length}
                    />
                </Stack>
                {services.isSuccess &&
                    allServices.length > 0 &&
                    !visibleServices.length && (
                        <Typography color="text.secondary">
                            All platform cards are hidden. Use Customize platform cards to show them again.
                        </Typography>
                    )}
                <CardGrid>
                    {visibleServices.map((service) => (
                        <Card key={service.uid} autoHeight>
                            <Box sx={{ p: { xs: 2, md: 3 } }}>
                                <Stack spacing={2}>
                                    <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                                        <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
                                            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
                                                <Typography variant="h6" sx={{ overflowWrap: "anywhere" }}>{service.name}</Typography>
                                                <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                                                    <Typography variant="caption">Upstream</Typography>
                                                    <StatusChip status={service.status} />
                                                </Stack>
                                                <Chip size="small" variant="outlined" label={`${service.endpoints.length} endpoints`} />
                                            </Stack>
                                            <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                                                {service.transport === "python" ? `${service.platform} · Built-in integration` : service.base_url}
                                            </Typography>
                                            {service.transport !== "python" && service.auth_type === "login" && <Typography variant="body2" color="text.secondary">
                                                Credentials: {service.auth_status} · Expires: {date(service.credential_expires_at)}
                                            </Typography>}
                                            <Typography variant="body2" color="text.secondary">
                                                {service.total.toLocaleString()} requests · {service.success_rate == null ? "—" : `${service.success_rate.toFixed(1)}%`} successful
                                            </Typography>
                                            {service.transport === "python" && <Chip size="small" variant="outlined" label={`Guest: ${service.guest_status ?? "Unknown"}`} sx={{ alignSelf: "flex-start" }} />}
                                        </Stack>
                                        <Tooltip title="View details">
                                            <IconButton aria-label={`View ${service.name} details`} onClick={() => setDetails(service.uid)}><InfoOutlinedIcon /></IconButton>
                                        </Tooltip>
                                    </Stack>
                                    {service.transport === "python" && <Accounts service={service} />}
                                </Stack>
                            </Box>
                            <Dialog open={details === service.uid} onClose={() => setDetails(null)} fullWidth maxWidth="lg" aria-labelledby={`service-${service.uid}-title`}>
                                <DialogTitle id={`service-${service.uid}-title`}>{service.name}</DialogTitle>
                                <DialogContent dividers>
                                    <Stack spacing={2} sx={{ mb: 3 }}>
                                        <Stats data={service} />
                                        <IdentityPool service={service} />
                                    </Stack>
                                    {service.transport !== "python" && service.auth_type === "login" && (
                                        <Paper
                                            variant="outlined"
                                            sx={{ p: 2, mb: 2 }}
                                        >
                                            <Stack spacing={1}>
                                                <Typography variant="subtitle2">
                                                    Login and credentials
                                                </Typography>
                                                <Typography variant="body2">
                                                    Last reauthentication:{" "}
                                                    {date(
                                                        service.reauthenticated_at,
                                                    )}{" "}
                                                    · Last credential check:{" "}
                                                    {date(
                                                        service.auth_checked_at,
                                                    )}
                                                </Typography>
                                                {service.auth_error && (
                                                    <Alert severity="error">
                                                        {service.auth_error}
                                                    </Alert>
                                                )}
                                                {service.auth_status ===
                                                    "Expired" && (
                                                    <Alert severity="warning">
                                                        Credentials have
                                                        expired. Reauthenticate
                                                        with a renewed
                                                        credentials and updated
                                                        expiry.
                                                    </Alert>
                                                )}
                                                {service.auth_status ===
                                                    "Missing" && (
                                                    <Alert severity="warning">
                                                        Credentials are missing.
                                                        Reauthenticate before
                                                        making requests.
                                                    </Alert>
                                                )}
                                                {!service.auth_check_endpoint && (
                                                    <Alert severity="info">
                                                        No credential-check endpoint is configured for this platform.
                                                    </Alert>
                                                )}
                                                <Stack
                                                    direction="row"
                                                    spacing={1}
                                                    useFlexGap
                                                    sx={{ flexWrap: "wrap" }}
                                                >
                                                    <Button
                                                        variant="outlined"
                                                        disabled={
                                                            action.isPending
                                                        }
                                                        onClick={() =>
                                                            setReauthenticating(
                                                                service,
                                                            )
                                                        }
                                                    >
                                                        Reauthenticate
                                                    </Button>
                                                    <Button
                                                        startIcon={
                                                            <RefreshRoundedIcon />
                                                        }
                                                        disabled={
                                                            action.isPending ||
                                                            !service.enabled ||
                                                            !service.has_api_key ||
                                                            !service.auth_check_endpoint
                                                        }
                                                        onClick={() =>
                                                            action.mutate(
                                                                async () => {
                                                                    const result =
                                                                        await api
                                                                            .post(
                                                                                `${base}/services/${service.uid}/auth/refresh`,
                                                                                {
                                                                                    timeout: 180000,
                                                                                },
                                                                            )
                                                                            .json<{
                                                                                success: boolean;
                                                                                error:
                                                                                    | string
                                                                                    | null;
                                                                            }>();
                                                                    pushMsg(
                                                                        result.success
                                                                            ? "Saved credentials passed the upstream check."
                                                                            : (result.error ??
                                                                                  "Credential check failed."),
                                                                        result.success
                                                                            ? "success"
                                                                            : "warning",
                                                                    );
                                                                },
                                                            )
                                                        }
                                                    >
                                                        Refresh credentials
                                                    </Button>
                                                </Stack>
                                                <Typography
                                                    variant="caption"
                                                    color="text.secondary"
                                                >
                                                    Refresh rechecks the saved
                                                    credentials. Reauthenticate
                                                    replaces it. Expiry is
                                                    supplied by you; a refresh
                                                    does not extend it.
                                                </Typography>
                                            </Stack>
                                        </Paper>
                                    )}
                                    <Stack
                                        direction="row"
                                        spacing={1}
                                        useFlexGap
                                        sx={{
                                            flexWrap: "wrap",
                                            alignItems: "center",
                                            mb: 2,
                                        }}
                                    >
                                        {(
                                            <FormControlLabel
                                                label="Enabled"
                                                control={
                                                    <Switch
                                                        checked={
                                                            service.enabled
                                                        }
                                                        disabled={
                                                            action.isPending
                                                        }
                                                        onChange={(
                                                            _,
                                                            enabled,
                                                        ) =>
                                                            run(
                                                                () =>
                                                                    api.patch(
                                                                        `${base}/services/${service.uid}/enabled`,
                                                                        {
                                                                            json: {
                                                                                enabled,
                                                                            },
                                                                        },
                                                                    ),
                                                                enabled
                                                                    ? "Service enabled."
                                                                    : "Service disabled.",
                                                            )
                                                        }
                                                    />
                                                }
                                            />
                                        )}
                                        <Button
                                            disabled={
                                                action.isPending ||
                                                !service.enabled ||
                                                !service.endpoints.some(
                                                    (endpoint) =>
                                                        endpoint.enabled &&
                                                        endpoint.probe_enabled,
                                                )
                                            }
                                            onClick={() => check(service.uid)}
                                        >
                                            Check platform
                                        </Button>
                                        {!service.adapter_key && (
                                            <Button
                                                color="error"
                                                disabled={
                                                    action.isPending ||
                                                    Boolean(service.adapter_key)
                                                }
                                                onClick={() =>
                                                    setDeleting(service)
                                                }
                                            >
                                                Delete
                                            </Button>
                                        )}
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                        >
                                            Every {service.interval_seconds}s ·{" "}
                                            {service.transport === "python" ? "Authentication is defined per endpoint" : service.has_api_key ? "API key configured" : "No API key"}
                                        </Typography>
                                    </Stack>
                                    <TableContainer>
                                        <Table
                                            size="small"
                                            sx={{ minWidth: 720 }}
                                            aria-label={`${service.name} endpoints`}
                                        >
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>
                                                        Endpoint
                                                    </TableCell>
                                                    <TableCell>
                                                        Status
                                                    </TableCell>
                                                    <TableCell>
                                                        Lifetime statistics
                                                    </TableCell>
                                                    <TableCell>
                                                        Actions
                                                    </TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {service.endpoints.map(
                                                    (endpoint) => (
                                                        <TableRow
                                                            key={endpoint.key}
                                                        >
                                                            <TableCell
                                                                sx={{
                                                                    maxWidth: 280,
                                                                    overflowWrap:
                                                                        "anywhere",
                                                                }}
                                                            >
                                                                <Typography variant="body2">
                                                                    {
                                                                        endpoint.name
                                                                    }
                                                                    {endpoint.requires_auth && <Chip size="small" label="Login required" sx={{ ml: 1 }} />}
                                                                    {service.kind === "dtk" && service.platform === "douyin" && endpoint.key === "profile" && <Tooltip title="Tries guest identities first, then an authenticated account if needed."><Chip size="small" variant="outlined" label="May require login" sx={{ ml: 1 }} /></Tooltip>}
                                                                </Typography>
                                                                <Typography
                                                                    variant="caption"
                                                                    color="text.secondary"
                                                                >
                                                                    GET{" "}
                                                                    {
                                                                        endpoint.path
                                                                    }
                                                                </Typography>
                                                                <Typography
                                                                    variant="caption"
                                                                    sx={{ display: "block" }}
                                                                >
                                                                    Key:{" "}
                                                                    {
                                                                        endpoint.key
                                                                    }
                                                                </Typography>
                                                                <Typography
                                                                    variant="caption"
                                                                    color="text.secondary"
                                                                    sx={{ display: "block" }}
                                                                >
                                                                    {endpoint.probe_enabled
                                                                        ? "Probe configured"
                                                                        : "Observed on user requests"}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <StatusChip
                                                                    status={
                                                                        endpoint.status
                                                                    }
                                                                />
                                                            </TableCell>
                                                            <TableCell>
                                                                <Stats
                                                                    data={
                                                                        endpoint
                                                                    }
                                                                />
                                                            </TableCell>
                                                            <TableCell>
                                                                {(
                                                                    <Switch
                                                                        checked={
                                                                            endpoint.enabled
                                                                        }
                                                                        disabled={
                                                                            action.isPending
                                                                        }
                                                                        slotProps={{
                                                                            input: {
                                                                                "aria-label": `Enable ${endpoint.name}`,
                                                                            },
                                                                        }}
                                                                        onChange={(
                                                                            _,
                                                                            enabled,
                                                                        ) =>
                                                                            run(
                                                                                () =>
                                                                                    api.put(
                                                                                        `${base}/services/${service.uid}`,
                                                                                        {
                                                                                            json: {
                                                                                                ...configOf(
                                                                                                    service,
                                                                                                ),
                                                                                                endpoints:
                                                                                                    configOf(
                                                                                                        service,
                                                                                                    ).endpoints.map(
                                                                                                        (
                                                                                                            item,
                                                                                                        ) =>
                                                                                                            item.key ===
                                                                                                            endpoint.key
                                                                                                                ? {
                                                                                                                      ...item,
                                                                                                                      enabled,
                                                                                                                  }
                                                                                                                : item,
                                                                                                    ),
                                                                                            },
                                                                                        },
                                                                                    ),
                                                                                enabled
                                                                                    ? "Endpoint enabled."
                                                                                    : "Endpoint disabled.",
                                                                            )
                                                                        }
                                                                    />
                                                                )}
                                                                <Button
                                                                    size="small"
                                                                    disabled={
                                                                        action.isPending ||
                                                                        !service.enabled ||
                                                                        !endpoint.enabled ||
                                                                        !endpoint.probe_enabled
                                                                    }
                                                                    onClick={() =>
                                                                        check(
                                                                            service.uid,
                                                                            endpoint.key,
                                                                        )
                                                                    }
                                                                >
                                                                    Check
                                                                </Button>
                                                            </TableCell>
                                                        </TableRow>
                                                    ),
                                                )}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </DialogContent>
                                <DialogActions><Button onClick={() => setDetails(null)}>Close</Button></DialogActions>
                            </Dialog>
                        </Card>
                    ))}
                </CardGrid>
            </Stack>
            {guestSettingsOpen && <GuestSettingsDialog onClose={() => setGuestSettingsOpen(false)} />}
            {reauthenticating && (
                <CredentialsDialog
                    name={reauthenticating.name}
                    pending={action.isPending}
                    onClose={() => setReauthenticating(null)}
                    onSave={async (credentials) => {
                        await action.mutateAsync(() =>
                            api.post(
                                `${base}/services/${reauthenticating.uid}/auth/reauthenticate`,
                                { json: credentials },
                            ),
                        );
                        setReauthenticating(null);
                        pushMsg(
                            "Credentials replaced. Refresh to verify them.",
                            "success",
                        );
                    }}
                />
            )}
            <Dialog
                open={deleting !== null}
                onClose={action.isPending ? undefined : () => setDeleting(null)}
            >
                <DialogTitle>Delete {deleting?.name}?</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        This removes the service, its credentials, and all its
                        monitoring history.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button
                        disabled={action.isPending}
                        onClick={() => setDeleting(null)}
                    >
                        Cancel
                    </Button>
                    <Button
                        color="error"
                        disabled={action.isPending}
                        onClick={() => {
                            if (!deleting) return;
                            const uid = deleting.uid;
                            action.mutate(
                                () => api.delete(`${base}/services/${uid}`),
                                {
                                    onSuccess: () => {
                                        if (serviceFilter === String(uid))
                                            setServiceFilter("all");
                                        setDeleting(null);
                                        pushMsg("Service deleted.", "success");
                                    },
                                },
                            );
                        }}
                    >
                        Delete service
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
