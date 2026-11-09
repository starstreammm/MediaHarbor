import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";

import { api } from "~/hooks/api";
import { pushError, pushMsg } from "~/components/error_popout";
import type { AccountFilter } from "~/model/cursor";
import type { TableAccount } from "~/model/table";
import { AccountFilterPanel } from "./filter";

export function AccountSyncDialog({
    title = "Sync settings",
    defaultEnabled,
    defaultFilter,
    canSync = true,
    actions,
    onSave,
    onClose,
}: {
    title?: string;
    defaultEnabled: boolean;
    defaultFilter: AccountFilter;
    canSync?: boolean;
    actions?: ReactNode;
    onSave: (enabled: boolean, filter: AccountFilter) => void | Promise<void>;
    onClose: () => void;
}) {
    const [enabled, setEnabled] = useState(defaultEnabled);
    const [filter, setFilter] = useState(defaultFilter);
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        try {
            await onSave(enabled, filter);
            onClose();
        } catch (error) {
            pushError(error, "Save sync settings");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog
            open
            onClose={saving ? undefined : onClose}
            onKeyDown={(event) => {
                if (event.key === "Escape") event.stopPropagation();
            }}
            fullWidth
            maxWidth="sm"
            aria-labelledby="sync-settings-title"
        >
            <DialogTitle id="sync-settings-title">{title}</DialogTitle>
            <DialogContent dividers>
                <Box component="fieldset" disabled={saving} sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}>
                    {actions ? <>{actions}<Divider sx={{ my: 2 }} /></> : null}
                    <FormControlLabel
                        label="Automatic sync"
                        control={<Switch checked={enabled} onChange={(_, checked) => setEnabled(checked)} disabled={!canSync} />}
                    />
                    <Typography variant="body2" color="text.secondary">
                        {enabled
                            ? "Check for new posts automatically, between 13 minutes and 30 days apart."
                            : "Automatic checks are off."}
                        {!canSync ? " A platform account is required to enable sync." : ""}
                    </Typography>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Download filters</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Choose which posts to download. All observed posting times still inform the forecast.
                    </Typography>
                    <AccountFilterPanel defaultFilter={defaultFilter} onChange={setFilter} />
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
                <Button onClick={onClose} disabled={saving}>Cancel</Button>
                <Button variant="contained" loading={saving} onClick={() => void save()}>Save changes</Button>
            </DialogActions>
        </Dialog>
    );
}

export default function SyncSettingsDialog({ uid, actions, onClose }: {
    uid: number;
    actions?: ReactNode;
    onClose: () => void;
}) {
    const client = useQueryClient();
    const query = useQuery({
        queryKey: ["account-sync-settings", uid],
        queryFn: ({ signal }) => api.get("/api/account/profile/uid", {
            searchParams: { uid }, signal,
        }).json<TableAccount>(),
        staleTime: 0,
        gcTime: 0,
        retry: false,
        refetchOnWindowFocus: false,
    });

    if (query.data) {
        const account = query.data;
        return (
            <AccountSyncDialog
                title={`Account settings · ${account.alias}`}
                defaultEnabled={account.sync_enabled}
                defaultFilter={account.filter ?? {}}
                canSync={Boolean(account.platform && account.pid)}
                actions={actions}
                onClose={onClose}
                onSave={async (enabled, filter) => {
                    await api.post("/api/account/update", {
                        json: { uid, sync: enabled, filter },
                    });
                    await Promise.all([
                        client.invalidateQueries({ queryKey: ["account-sync-settings", uid] }),
                        client.invalidateQueries({ queryKey: ["account-sync-details", uid] }),
                    ]);
                    pushMsg("Sync settings saved.", "success");
                }}
            />
        );
    }

    return (
        <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="sync-settings-title">
            <DialogTitle id="sync-settings-title">Account settings</DialogTitle>
            {query.isPending ? <DialogContent><CircularProgress size={24} aria-label="Loading sync settings" /></DialogContent> : null}
            {query.isError ? (
                <DialogContent><Alert severity="error">Unable to load sync settings. {query.error.message}</Alert></DialogContent>
            ) : null}
            <DialogActions><Button onClick={onClose}>Cancel</Button></DialogActions>
        </Dialog>
    );
}
