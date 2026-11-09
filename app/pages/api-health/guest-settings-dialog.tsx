import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, LinearProgress, Stack, Switch, TextField, Typography } from "@mui/material";
import { api } from "~/hooks/api";


interface PoolSettings {
    minimum_size: number;
    target_size: number;
    use_proxy: boolean;
}

interface GuestSettings {
    douyin: PoolSettings;
    tiktok: PoolSettings;
    proxy: { url: string; username: string; has_password: boolean };
    different_legacy_proxies: boolean;
}

const endpoint = "/api/integrations/guest-settings";

function SettingsForm({ initial, onClose, onPendingChange }: {
    initial: GuestSettings;
    onClose: () => void;
    onPendingChange: (pending: boolean) => void;
}) {
    const queryClient = useQueryClient();
    const [settings, setSettings] = useState(initial);
    const [password, setPassword] = useState("");
    const [clearPassword, setClearPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const save = useMutation({
        onMutate: () => onPendingChange(true),
        mutationFn: () => api.put(endpoint, { json: {
            douyin: settings.douyin,
            tiktok: settings.tiktok,
            proxy: { url: settings.proxy.url, username: settings.proxy.username, password: clearPassword ? "" : password || null },
        } }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["api-health"] });
            onClose();
        },
        onError: () => setError("Could not save guest settings. Check the values and backend connection, then retry."),
        onSettled: () => onPendingChange(false),
    });
    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (save.isPending) return;
        for (const platform of ["douyin", "tiktok"] as const) {
            const pool = settings[platform];
            if (!Number.isInteger(pool.minimum_size) || !Number.isInteger(pool.target_size) || pool.minimum_size < 0
                || pool.minimum_size > pool.target_size || (pool.target_size > 0 && pool.minimum_size === 0)) {
                setError("Pool sizes must be 0/0 or positive whole numbers with minimum no greater than target.");
                return;
            }
        }
        if ((settings.douyin.use_proxy || settings.tiktok.use_proxy) && !settings.proxy.url.trim()) {
            setError("Enter a shared proxy URL before enabling it for a platform.");
            return;
        }
        if (!settings.proxy.username && !clearPassword && (password || initial.proxy.has_password)) {
            setError("Enter a proxy username or remove the proxy password.");
            return;
        }
        setError(null);
        save.mutate();
    };

    return (
        <form onSubmit={submit}>
            <DialogContent dividers>
                <Stack spacing={3}>
                    {error && <Alert severity="error">{error}</Alert>}
                    {initial.different_legacy_proxies && <Alert severity="info">The environment uses different platform proxies. Saving replaces them with the shared proxy below.</Alert>}
                    <Typography variant="body2" color="text.secondary">Guest pools refill below the minimum and stop at the target. New defaults are 13 / 33; use 0 / 0 to stop refilling.</Typography>
                    {(["douyin", "tiktok"] as const).map(platform => (
                        <Stack key={platform} spacing={1.5}>
                            <Typography variant="h6">{platform === "douyin" ? "Douyin" : "TikTok"}</Typography>
                            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                                {(["minimum_size", "target_size"] as const).map(field => <TextField key={field} fullWidth required type="number"
                                    label={field === "minimum_size" ? "Minimum size" : "Target size"} value={settings[platform][field]} disabled={save.isPending}
                                    slotProps={{ htmlInput: { min: 0, step: 1 } }}
                                    onChange={event => setSettings(current => ({ ...current, [platform]: { ...current[platform], [field]: Number(event.target.value) } }))} />)}
                            </Stack>
                            <FormControlLabel label="Use shared proxy for new guests" control={<Switch checked={settings[platform].use_proxy} disabled={save.isPending}
                                onChange={(_, use_proxy) => setSettings(current => ({ ...current, [platform]: { ...current[platform], use_proxy } }))} />}/>
                        </Stack>
                    ))}
                    <Stack spacing={2}>
                        <Typography variant="h6">Shared proxy</Typography>
                        <TextField label="Proxy URL" value={settings.proxy.url} disabled={save.isPending} placeholder="http://proxy.example.com:8080"
                            helperText="HTTP, HTTPS, SOCKS5 or SOCKS5H. Enter credentials separately."
                            onChange={event => setSettings(current => ({ ...current, proxy: { ...current.proxy, url: event.target.value } }))} />
                        <TextField label="Proxy username" value={settings.proxy.username} disabled={save.isPending} autoComplete="off"
                            onChange={event => setSettings(current => ({ ...current, proxy: { ...current.proxy, username: event.target.value } }))} />
                        <TextField label="Proxy password" type="password" value={password} disabled={save.isPending || clearPassword} autoComplete="new-password"
                            helperText={initial.proxy.has_password ? "A password is saved. Leave blank to keep it." : "Optional proxy password."}
                            onChange={event => setPassword(event.target.value)} />
                        {initial.proxy.has_password && <FormControlLabel label="Remove saved proxy password" control={<Checkbox checked={clearPassword} disabled={save.isPending} onChange={(_, checked) => setClearPassword(checked)} />} />}
                        <Typography variant="body2" color="text.secondary">Proxy changes apply to newly generated guests. Existing guests keep their original network route.</Typography>
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button disabled={save.isPending} onClick={onClose}>Cancel</Button>
                <Button variant="contained" type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save settings"}</Button>
            </DialogActions>
        </form>
    );
}

export default function GuestSettingsDialog({ onClose }: { onClose: () => void }) {
    const [pending, setPending] = useState(false);
    const settings = useQuery({ queryKey: ["api-health", "guest-settings"], queryFn: () => api.get(endpoint).json<GuestSettings>(), retry: false });
    return (
        <Dialog open onClose={pending ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="guest-settings-title">
            <DialogTitle id="guest-settings-title">Guest pool settings</DialogTitle>
            {settings.isPending ? <DialogContent><LinearProgress aria-label="Loading guest settings" /></DialogContent>
                : settings.isError ? <DialogContent><Alert severity="error" action={<Button onClick={() => { void settings.refetch(); }}>Retry</Button>}>Could not load guest settings.</Alert></DialogContent>
                    : <SettingsForm initial={settings.data} onClose={onClose} onPendingChange={setPending} />}
        </Dialog>
    );
}
