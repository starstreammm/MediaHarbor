import { useImperativeHandle, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import { Link } from "react-router";

import { api } from "~/hooks/api";
import type { ApiInitStatus, ApiPlatformRegistration } from "~/model/api";
import { fetchApiInitStatus } from "~/function/init";
import Accounts from "~/pages/api-health/accounts";


export default function ApiInit({ onEnd, onNext, disabled, ready, ref }: {
    onEnd?: (error_occurred: boolean) => void;
    onNext?: () => void;
    disabled?: boolean;
    ready?: boolean;
    ref?: React.Ref<{ onSubmit: () => void }>;
}) {
    const [status, setStatus] = useState<ApiInitStatus>({});
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const submitting = useRef(false);
    const catalog = useQuery({
        queryKey: ["api-catalog"],
        queryFn: () => api.get("/api/init/api/catalog").json<ApiPlatformRegistration[]>(),
        retry: false,
        refetchInterval: busy ? false : 8000,
    });

    async function onUpdate() {
        if (submitting.current) return;
        submitting.current = true;
        setBusy(true);
        setError(null);
        setStatus({});
        try {
            if (!catalog.data) throw new Error("Load the API catalog before initializing.");
            for await (const progress of fetchApiInitStatus({})) {
                setStatus(progress);
            }
            onEnd?.(false);
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "API initialization failed.");
            onEnd?.(true);
        } finally {
            await catalog.refetch();
            submitting.current = false;
            setBusy(false);
        }
    }

    useImperativeHandle(ref, () => ({ onSubmit: () => { void onUpdate(); } }));

    return (
        <Stack spacing={2} sx={{ width: "100%" }}>
            <Typography variant="body2" color="text.secondary">
                Start platforms when you are ready. Add login accounts below for features that need them.
                Completed setup steps restart automatically on later launches.
            </Typography>
            {catalog.isPending && <CircularProgress size={24} />}
            {catalog.isError && <Alert severity="error" action={
                <Button onClick={() => { void catalog.refetch(); }}>Retry</Button>
            }>Could not load APIs. Initialize the database first.</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
            {catalog.data?.map(item => {
                const updating = busy && status[item.key] === "";
                return (
                    <Box key={item.key} sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2 }}>
                        <Stack spacing={1}>
                            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                                <Typography sx={{ fontWeight: "bold" }}>{item.name}</Typography>
                                {item.authenticated_endpoints.length > 0 && <Chip size="small" label="Some features require login" />}
                                <Chip size="small" color={item.state === "Ready" ? "success" : "default"}
                                    label={updating ? "Initializing" : item.state === "Ready" ? "Ready for requests" : item.state} />
                            </Stack>
                            <Typography variant="body2" color="text.secondary">
                                Guest endpoints work independently of authenticated accounts.
                            </Typography>
                            {item.error && <Alert severity="error">{item.error}</Alert>}
                            {item.authenticated_endpoints.length > 0 && <Accounts service={{ name: item.name, platform: item.key, enabled: item.enabled }} />}
                        </Stack>
                    </Box>
                );
            })}
            <Typography variant="body2">
                Review platform health and manage accounts in <Link to="/api-health">API Health</Link>.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                {!ref && <Button variant="outlined" disabled={disabled || busy || !catalog.data}
                    onClick={() => { void onUpdate(); }}>{busy ? "Initializing…" : "Start / retry APIs"}</Button>}
                {onNext && <Button variant="contained" disabled={disabled || busy || !ready || Boolean(error)}
                    onClick={onNext}>Continue</Button>}
            </Stack>
        </Stack>
    );
}
