import { Button, IconButton } from "@mui/material";
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { enqueueSnackbar, closeSnackbar, type VariantType } from "notistack";
import { HTTPError, TimeoutError } from "ky";


export let openMsg = true;

export function pushMsg(
    text: string,
    level: VariantType = "info",
    timeout: number = 6000
) {
    if (!openMsg) return;

    enqueueSnackbar(text, {
        variant: level,
        action: (snackbarId) => (
            <IconButton
                onClick={() => closeSnackbar(snackbarId)}
                sx={{ borderRadius: 1, p: 0.5 }}
            >
                <CloseRoundedIcon sx={{ color: "white" }} />
            </IconButton>
        ),
        autoHideDuration: timeout,
        preventDuplicate: true,
    });
}


export function pushError(
    error: unknown,
    prefix = "",
) {
    if (!openMsg) return;

    let text = "";

    try {
        if (error instanceof HTTPError) {
            const response = error.response;

            const parts: string[] = [];

            if (response.status) {
                parts.push(`HTTP ${response.status}`);
            }

            if (response.statusText) {
                parts.push(response.statusText);
            }

            const data = error.data;

            if (
                typeof data === "object" &&
                "detail" in data &&
                typeof data.detail === "string"
            ) {
                parts.push(data.detail);
            }
            else {
                parts.push("Unknown error.");
            }

            text = parts.join(" - ");
        }

        else if (error instanceof TimeoutError) {
            text = "Request timeout";
        }

        else if (
            error instanceof DOMException &&
            error.name === "AbortError"
        ) {
            text = "Request aborted";
        }

        else if (error instanceof Error) {
            const msg = error.message;

            if (
                error.name === "TypeError" ||
                msg.includes("Failed to fetch") ||
                msg.includes("NetworkError") ||
                msg.includes("fetch failed") ||
                msg.includes("ECONNREFUSED") ||
                msg.includes("ECONNRESET") ||
                msg.includes("ENOTFOUND") ||
                msg.includes("ERR_NETWORK")
            ) {
                text = "Unable to connect to server";
            } else {
                text = msg;
            }
        }

        else if (typeof error === "string") {
            text = error;
        }

        else {
            try {
                text = JSON.stringify(error);
            } catch {
                text = String(error);
            }
        }
    } catch {
        text = "Unknown error";
    }

    if (!text) {
        text = "Unknown error";
    }

    const finalText = prefix
        ? `${prefix.endsWith(":") ? prefix : `${prefix}:`} ${text}`
        : text;

    pushMsg(finalText, "error");
}

export function clearAllMsg() {
    closeSnackbar();
}

export function pushTaskSuccess(text: string) {
    if (!openMsg) return;

    enqueueSnackbar(text, {
        variant: "info",
        action: (snackbarId) => (
            <>
                <Button onClick={() => {
                    closeSnackbar(snackbarId);
                    window.location.href = "/tasks";
                }}>
                    View
                </Button>
                <IconButton
                    onClick={() => closeSnackbar(snackbarId)}
                    sx={{ borderRadius: 1, p: 0.5, ml: 1 }}
                >
                    <CloseRoundedIcon sx={{ color: "white" }} />
                </IconButton>
            </>
        ),
        autoHideDuration: 6000,
        preventDuplicate: true,
    });
}