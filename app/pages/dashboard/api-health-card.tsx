import { Alert, Box, Button, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "~/hooks/api";
import type { HealthStatus, IntegrationService } from "~/model/integration";
import { Card } from "./components";


const statuses: HealthStatus[] = ["Healthy", "Partial", "Degraded", "Login Required", "Expired", "Error", "Unavailable", "Unknown", "Disabled"];
const colors = {
    Partial: "warning", Degraded: "warning", "Login Required": "warning",
    Healthy: "success", Expired: "warning", Error: "error", Unavailable: "error", Unknown: "default", Disabled: "default",
} as const;

export default function ApiHealthCard() {
    const services = useQuery({
        queryKey: ["api-health", "services"],
        queryFn: () => api.get("/api/integrations/services").json<IntegrationService[]>(),
        refetchInterval: 30000,
        retry: false,
    });
    const data = services.data ?? [];
    const healthy = data.filter(service => service.status === "Healthy").length;
    const attention = data.filter(service => ["Partial", "Degraded", "Login Required", "Expired", "Error", "Unavailable"].includes(service.status)).length;
    const lastCheck = data.reduce((latest, service) => Math.max(latest, service.last_check ? Date.parse(service.last_check) : 0), 0);

    return (
        <Card>
            <Stack spacing={2} sx={{ p: { xs: 2, md: 3 }, height: "100%", overflowY: "auto" }}>
                <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
                    <Typography variant="h5" sx={{ fontWeight: "1000" }}>API Health</Typography>
                    <Button component={Link} to="/api-health" size="small">View details</Button>
                </Stack>
                {services.isPending ? <LinearProgress aria-label="Loading API health" />
                    : services.isError ? <Alert severity="error" action={<Button onClick={() => { void services.refetch(); }}>Retry</Button>}>
                        Could not load API health.
                    </Alert>
                        : data.length === 0 ? <Typography color="text.secondary">No platforms initialized. Start APIs on the initialization page.</Typography>
                            : <>
                                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
                                    {[
                                        { label: "Platforms", value: data.length, color: "text.primary" },
                                        { label: "Healthy", value: healthy, color: "success.main" },
                                        { label: "Need attention", value: attention, color: attention ? "error.main" : "text.primary" },
                                    ].map(item => (
                                        <Box key={item.label}>
                                            <Typography variant="h4" color={item.color}>{item.value}</Typography>
                                            <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                                        </Box>
                                    ))}
                                </Box>
                                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
                                    {statuses.map(status => {
                                        const count = data.filter(service => service.status === status).length;
                                        return count > 0 ? <Chip key={status} size="small" color={colors[status]} label={`${status}: ${count}`} /> : null;
                                    })}
                                </Stack>
                                <Typography variant="caption" color="text.secondary">
                                    Last check: {lastCheck ? new Date(lastCheck).toLocaleString() : "Never"}
                                </Typography>
                            </>}
            </Stack>
        </Card>
    );
}
