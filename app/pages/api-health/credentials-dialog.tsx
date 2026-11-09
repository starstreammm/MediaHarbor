import { useState } from "react";
import {
    Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField,
} from "@mui/material";


export default function CredentialsDialog({ name, pending, onClose, onSave }: {
    name: string;
    pending: boolean;
    onClose: () => void;
    onSave: (credentials: { api_key: string; credential_expires_at: string | null }) => Promise<void>;
}) {
    const [apiKey, setApiKey] = useState("");
    const [expiresAt, setExpiresAt] = useState("");
    const [error, setError] = useState<string | null>(null);

    const save = async () => {
        try {
            setError(null);
            await onSave({ api_key: apiKey, credential_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null });
        } catch (error) {
            setError(error instanceof Error ? error.message : "Could not replace credentials.");
        }
    };

    return (
        <Dialog open fullWidth maxWidth="sm" onClose={pending ? undefined : onClose}>
            <Box component="form" onSubmit={event => { event.preventDefault(); void save(); }}>
                <DialogTitle>Reauthenticate {name}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <Alert severity="info">Enter the browser Cookie header for a built-in platform, or the API key for an HTTP service. Saving replaces the previous credentials. Use Refresh afterward to verify it.</Alert>
                        {error && <Alert severity="error">{error}</Alert>}
                        <TextField required label="New credentials" type="password" autoComplete="new-password"
                            value={apiKey} disabled={pending} onChange={event => setApiKey(event.target.value)} />
                        <TextField label="New expiry (local time)" type="datetime-local" value={expiresAt} disabled={pending}
                            slotProps={{ inputLabel: { shrink: true } }} helperText="Leave blank if the provider does not give an expiry time."
                            onChange={event => setExpiresAt(event.target.value)} />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button disabled={pending} onClick={onClose}>Cancel</Button>
                    <Button variant="contained" type="submit" disabled={pending}>{pending ? "Saving…" : "Replace credentials"}</Button>
                </DialogActions>
            </Box>
        </Dialog>
    );
}
