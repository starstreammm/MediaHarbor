import {
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Typography,
    CircularProgress,
} from "@mui/material";
import NotInterestedRoundedIcon from '@mui/icons-material/NotInterestedRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';

import {
    useState,
    useRef,
    useEffect,
    useImperativeHandle,
} from "react";

import type { TableSettings } from "~/model/table";
import type { ApiInitStatus } from "~/model/api";
import { Platform } from "~/model/enum";
import { NextButton, ConfigInput } from "~/pages/init/components";
import { fetchApiInitStatus } from "~/function/init";
import { fetchSettings } from "~/function/setting";

export default function ApiInit({ onEnd, onNext, disabled, ref }: {
    onEnd?: (error_occurred: boolean) => void;
    onNext?: () => void;
    disabled?: boolean;
    ref?: React.Ref<{ onSubmit: () => void }>;
}) {
    // 0: input, 1: updating, 2: finished, 3: error
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<ApiInitStatus>({});

    const org = useRef<TableSettings>({} as TableSettings);
    const [now, setNow] = useState<TableSettings>(org.current);


    useImperativeHandle(ref, () => ({ onSubmit() { onUpdate(); }, }));


    async function onUpdate() {
        setProgress(1);
        try {
            for await (const res of fetchApiInitStatus(org.current, now, () => setProgress(3))) {
                setStatus(res);
            }
            setProgress(2);
            onEnd?.(false);
        }
        catch { onEnd?.(true); }
    }

    useEffect(() => {
        fetchSettings()
            .then((res) => {
                setNow(res);
                org.current = res;
            });
    }, []);



    if (progress === 0) {
        return (
            <>
                {Platform.map((key) =>
                    <ConfigInput
                        key={key}
                        name={`${key.charAt(0).toUpperCase() + key.slice(1)} Cookie`}
                        value={now[`cookie_${key}` as keyof TableSettings] as string ?? ""}
                        setValue={(newValue: string) => setNow((prev) => ({ ...prev, [`cookie_${key}`]: newValue }))}
                        multiline
                        disabled={disabled}
                    />
                )}
                {!ref &&
                    <NextButton
                        onClick={() => onUpdate()}
                        label="Submit"
                    />
                }
            </>
        );
    }
    else {
        const statusIcon = (state: string | null | undefined) => {
            switch (state) {
                case null:
                    return <NotInterestedRoundedIcon color="disabled" />;
                case undefined:
                    return <NotInterestedRoundedIcon color="disabled" />;
                case "":
                    return <CircularProgress size={28} color="secondary" />;
                case "true":
                    return <CheckCircleRoundedIcon color="success" />;
                case "false":
                    return <WarningRoundedIcon color="warning" />;
                default:
                    return <ErrorRoundedIcon color="error" />;
            }
        };

        const statusText = (state: string | null | undefined) => {
            switch (state) {
                case null:
                    return ": Unset";
                case undefined:
                    return ": Unset";
                case "true":
                    return "";
                case "false":
                    return ": The cookie is updated more than 30 days ago, please update it.";
                default:
                    return `: ${state}`;
            }
        };

        return (
            <>
                <List>
                    {Platform.map((key) => (
                        <ListItem key={key}>
                            <ListItemIcon>
                                {statusIcon(status[key])}
                            </ListItemIcon>
                            <ListItemText>
                                <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
                                    {key.charAt(0).toUpperCase() + key.slice(1)}
                                    {statusText(status[key])}
                                </Typography>
                            </ListItemText>
                        </ListItem>
                    ))}
                </List>
                {onNext && (progress === 2
                    ? <NextButton onClick={() => onNext?.()} />
                    : <NextButton onClick={onUpdate} label="Retry" />
                )}
            </>
        );
    }
}