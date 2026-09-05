import {
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Alert,
    Box,
    Button,
    TextField,
} from "@mui/material";

import { useState } from "react";

export default function DeleteConfirmDialog({ onClose, confirmKey, remind }: {
    onClose: (needDelete: boolean) => void;
    confirmKey: string;
    remind?: React.ReactElement;
}) {
    const [input, setInput] = useState("");

    return (
        <Dialog open onClose={() => onClose(false)}>
            <DialogTitle>
                <b>Are you sure to delete?</b>
            </DialogTitle>
            <DialogContent>
                <Alert variant="filled" severity="warning" sx={{ alignItems: "center" }}>
                    This action cannot be <b>undone</b>.<br />
                    {remind}<br />
                    Make sure you truly want to delete it before proceeding.<br />
                    Please type <b>"{confirmKey}"</b> into the input field below to confirm deletion.
                </Alert>
                <TextField
                    sx={{ mt: 3 }}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    fullWidth
                    label="Confirm Deletion"
                    variant="outlined"
                />
            </DialogContent>
            <DialogActions>
                <Box sx={{ display: "flex", gap: 3, p: { xs: 1, md: 3 } }}>
                    <Button onClick={() => onClose(false)} variant="outlined">
                        Cancel
                    </Button>
                    <Button
                        onClick={() => onClose(true)}
                        variant="contained"
                        color="error"
                        disabled={input !== confirmKey}
                    >
                        Delete
                    </Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}