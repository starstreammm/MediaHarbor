import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, TextField, Typography } from "@mui/material";
import { HTTPError } from "ky";
import { api } from "~/hooks/api";
import { pushError, pushMsg } from "~/components/error_popout";
import type { AuthenticatedAccount, IntegrationService } from "~/model/integration";

interface LoginSession {
    uid: string;
    status: "pending" | "confirmed" | "expired" | "failed" | "cancelled";
    phase: "waiting" | "scanned" | "preparing" | "validating";
    qr_ready: boolean;
    qr_version: number;
    expires_at: string;
    error: string | null;
}

type AccountPlatform = Pick<IntegrationService, "name" | "platform" | "enabled" | "accounts" | "authenticated_status">;
const base = "/api/integrations";

function QrImage({ sessionId, version, platformName }: { sessionId: string; version: number; platformName: string }) {
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    return <>
        <Box component="img" src={`${base}/logins/${sessionId}/qr?v=${version}&attempt=${attempt}`}
            alt={`${platformName} login QR code`} onError={() => setFailed(true)}
            sx={{ display: failed ? "none" : "block", width: 216, height: 216, p: 1, bgcolor: "#fff", objectFit: "contain", alignSelf: "center" }} />
        {failed && <Alert severity="error" action={<Button onClick={() => {
            setFailed(false);
            setAttempt(value => value + 1);
        }}>Reload image</Button>}>The QR image could not be loaded.</Alert>}
    </>;
}

export default function Accounts({ service }: { service: AccountPlatform }) {
    const client = useQueryClient();
    const supportsQr = service.platform === "douyin" || service.platform === "tiktok";
    const [dialog, setDialog] = useState<"qr" | "import" | null>(null);
    const [sessionJson, setSessionJson] = useState("");
    const [replaceImport, setReplaceImport] = useState<string | null>(null);
    // Sessions belong to an open dialog; do not restore expired IDs from storage.
    const [sessionId, setSessionId] = useState<string | null>(null);
    const accountQuery = useQuery({
        queryKey: ["api-health", "accounts", service.platform],
        queryFn: () => api.get(`${base}/platforms/${service.platform}/accounts`).json<AuthenticatedAccount[]>(),
        enabled: service.accounts === undefined,
        refetchInterval: 30000,
        retry: false,
    });
    const accounts = service.accounts ?? accountQuery.data ?? [];
    const authStatus = service.authenticated_status ?? (
        service.accounts === undefined && (accountQuery.isPending || accountQuery.isError) ? "Unknown"
            : accounts.some(account => ["Healthy", "Degraded"].includes(account.health)) ? "Healthy"
            : accounts.some(account => account.health === "Unavailable") ? "Unavailable" : "Login Required"
    );
    const session = useQuery({
        queryKey: ["qr-login", service.platform, sessionId],
        queryFn: async () => {
            try {
                return await api.get(`${base}/logins/${sessionId}`).json<LoginSession>();
            } catch (error) {
                if (error instanceof HTTPError && error.response.status === 404) return null;
                throw error;
            }
        },
        enabled: dialog === "qr" && sessionId !== null,
        refetchInterval: query => !query.state.error && (query.state.data === undefined || query.state.data?.status === "pending") ? 2000 : false,
        retry: false,
    });
    const action = useMutation({
        mutationFn: (run: () => Promise<unknown>) => run(),
        onSettled: () => client.invalidateQueries({ queryKey: ["api-health"] }),
        onError: error => pushError(error, "Authenticated accounts"),
    });
    useEffect(() => {
        if (dialog !== "qr" || !sessionId || !session.isSuccess) return;
        if (session.data?.status === "confirmed" || session.data === null) {
            setSessionId(null);
            setDialog(null);
            void client.invalidateQueries({ queryKey: ["api-health"] });
            pushMsg(session.data ? "Account validated and added." : "Login session is no longer available. Start a new login.", session.data ? "success" : "info");
        }
    }, [client, dialog, sessionId, session.isSuccess, session.data]);

    const closeDialog = () => {
        const pendingId = dialog === "qr" && session.data?.status !== "confirmed" ? sessionId : null;
        setDialog(null);
        setSessionId(null);
        setSessionJson("");
        setReplaceImport(null);
        if (pendingId) void api.delete(`${base}/logins/${pendingId}`).catch(error => pushError(error, "Cancel login"));
    };
    const start = (replaceIdentity?: string) => {
        action.reset();
        setDialog("qr");
        action.mutate(async () => {
            if (sessionId) await api.delete(`${base}/logins/${sessionId}`);
            setSessionId(null);
            const result = await api.post(`${base}/platforms/${service.platform}/logins`, {
                json: { replace_identity: replaceIdentity },
            }).json<LoginSession>();
            client.setQueryData(["qr-login", service.platform, result.uid], result);
            setSessionId(result.uid);
        });
    };
    const openImport = (replaceIdentity?: string) => {
        action.reset();
        setReplaceImport(replaceIdentity ?? null);
        setSessionJson("");
        setDialog("import");
    };
    const pending = session.data?.status === "pending";
    const progressMessage = session.data?.phase === "scanned"
        ? "QR code scanned. Confirm the login on your phone."
        : session.data?.phase === "preparing"
            ? "Login confirmed on your phone. Preparing your session…"
            : session.data?.phase === "validating"
                ? "Validating and saving your account…"
                : null;

    return (
        <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Typography variant="subtitle2">Authenticated accounts</Typography>
                <Chip size="small" variant="outlined" label={authStatus} color={authStatus === "Healthy" ? "success" : "warning"} />
                <Button size="small" disabled={action.isPending || !service.enabled} onClick={() => openImport()}>Import session</Button>
                {supportsQr && <Button size="small" disabled={action.isPending || !service.enabled} onClick={() => start()}>Add account</Button>}
            </Stack>
            {service.accounts === undefined && accountQuery.isError && <Alert severity="error">Could not load authenticated accounts.</Alert>}
            {authStatus !== "Healthy" && authStatus !== "Unknown" && <Alert severity="warning">
                Some features require login. {authStatus === "Unavailable" ? "Accounts are temporarily cooling down." : "Add an account or re-login below."}
            </Alert>}
            {accounts.map(account => <Stack key={account.uid} spacing={0.5}>
                <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                    <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{account.account_name || account.account_id || "Account"}</Typography>
                    <Chip size="small" label={account.health} color={account.health === "Healthy" ? "success" : "warning"} />
                    <Button size="small" disabled={action.isPending} onClick={() => supportsQr ? start(account.uid) : openImport(account.uid)}>Re-login</Button>
                    <Button size="small" color="error" disabled={action.isPending} onClick={() => action.mutate(() => api.delete(`${base}/platforms/${service.platform}/accounts/${account.uid}`))}>Remove</Button>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                    {account.total_requests} attempts · {account.success_rate == null ? "No requests yet" : `${account.success_rate.toFixed(1)}% successful`} · Last success: {account.last_success_at ? new Date(account.last_success_at).toLocaleString() : "Never"}
                    {account.cooldown_until && account.health === "Unavailable" ? ` · Cooldown until ${new Date(account.cooldown_until).toLocaleTimeString()}` : ""}
                </Typography>
                {account.last_error && account.health !== "Healthy" && <Typography variant="caption" color="text.secondary">{account.last_error}</Typography>}
                {account.reauthentication_recommended && <Alert severity="warning">This account likely needs re-login. Other accounts stay available.</Alert>}
            </Stack>)}
            <Dialog open={dialog !== null} onClose={action.isPending ? undefined : closeDialog} fullWidth maxWidth="sm" aria-labelledby={`account-login-${service.platform}`}>
                <DialogTitle id={`account-login-${service.platform}`}>{dialog === "import" ? `Import ${service.name} session` : `${service.name} QR login`}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} role="status" aria-live="polite">
                        {dialog === "import" ? <>
                            <Typography variant="body2" color="text.secondary">
                                Import browser JSON with complete cookies, user_agent, browser_platform, screen, language and timezone. Use the platform's configured proxy. The session is validated before encrypted storage.
                            </Typography>
                            <TextField multiline minRows={5} maxRows={12} label="Browser session JSON" value={sessionJson} disabled={action.isPending}
                                onChange={event => setSessionJson(event.target.value)} slotProps={{ htmlInput: { spellCheck: false } }} />
                            {action.isPending && <LinearProgress aria-label="Validating imported session" />}
                        </> : <>
                            {action.isPending && <LinearProgress aria-label="Starting login" />}
                            {action.isError && <Alert severity="error">Could not start login. Please retry.</Alert>}
                            {sessionId && session.isError && <Alert severity="error" action={<Button onClick={() => { void session.refetch(); }}>Retry</Button>}>Could not read login status.</Alert>}
                            {sessionId && session.isPending && <LinearProgress aria-label="Loading login status" />}
                            {sessionId && pending && !session.isError && <>
                                {progressMessage ? <>
                                    <Stack spacing={2} sx={{ minHeight: 216, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                                        <CircularProgress aria-label={progressMessage} />
                                        <Typography variant="body2">{progressMessage}</Typography>
                                    </Stack>
                                    <Typography variant="body2" color="text.secondary">Keep this dialog open. It will close automatically when your account is ready.</Typography>
                                </> : <>
                                    <Typography variant="body2">Scan with {service.name} and confirm on your phone. Keep this dialog open while the session is validated.</Typography>
                                    {session.data?.qr_ready
                                        ? <QrImage key={`${sessionId}:${session.data.qr_version}`} sessionId={sessionId} version={session.data.qr_version} platformName={service.name} />
                                        : <><Typography variant="body2" color="text.secondary">Preparing your QR code…</Typography><LinearProgress aria-label="Preparing QR code" /></>}
                                </>}
                                <Typography variant="caption" color="text.secondary">Expires {new Date(session.data!.expires_at).toLocaleTimeString()}.</Typography>
                            </>}
                            {sessionId && session.data && ["expired", "failed", "cancelled"].includes(session.data.status) && <Alert severity="warning">{session.data.error || "Login cancelled."}</Alert>}
                        </>}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button disabled={action.isPending} onClick={closeDialog}>Cancel</Button>
                    {dialog === "import" ? <Button variant="contained" disabled={action.isPending || !sessionJson.trim()} onClick={() => action.mutate(async () => {
                        const json: unknown = JSON.parse(sessionJson);
                        if (replaceImport) await api.delete(`${base}/platforms/${service.platform}/accounts/${replaceImport}`);
                        await api.post(`${base}/platforms/${service.platform}/accounts`, { json, timeout: 40000 });
                        closeDialog();
                        pushMsg("Account validated and added.", "success");
                    })}>Validate and save</Button>
                        : (!sessionId || (!pending && !session.isPending)) && <Button disabled={action.isPending} onClick={() => start()}>New QR code</Button>}
                </DialogActions>
            </Dialog>
        </Stack>
    );
}
