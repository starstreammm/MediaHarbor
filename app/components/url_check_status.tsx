import { CircularProgress, Tooltip } from "@mui/material";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";

import type { UrlCheckState } from "~/model/api";

export default function UrlCheckStatus({ result }: { result: UrlCheckState }) {
    const message = result.status === "checking"
        ? "Checking URL…"
        : result.status === "passed"
            ? `${result.message}${result.platform ? ` (${result.platform.toUpperCase()})` : ""}`
            : result.message;

    return (
        <Tooltip title={message} arrow>
            <span role="status" aria-label={message} style={{ display: "inline-flex" }}>
                {result.status === "checking" ? <CircularProgress size={24} />
                    : result.status === "passed" ? <CheckCircleRoundedIcon color="success" />
                        : result.status === "exists" ? <WarningAmberRoundedIcon color="warning" />
                            : <ErrorRoundedIcon color="error" />}
            </span>
        </Tooltip>
    );
}
