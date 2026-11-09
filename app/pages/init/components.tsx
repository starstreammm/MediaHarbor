import {
    Box,
    Button,
    Typography,
    Tooltip,
    IconButton,
    TextField,
    ListItem,
    ListItemIcon,
    ListItemText,
} from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import InfoOutlineRoundedIcon from '@mui/icons-material/InfoOutlineRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import BorderColorRoundedIcon from '@mui/icons-material/BorderColorRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';

import { removeComments } from "~/function/init";


export function NextButton({ onClick, label = "Next", disabled = false }: {
    onClick: () => void;
    label?: string;
    disabled?: boolean;
}) {
    return (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
            <Button
                variant="contained"
                endIcon={<ArrowForwardRoundedIcon />}
                onClick={onClick}
                disabled={disabled}
            >
                {label}
            </Button>
        </Box>
    )
}


export function ConfigInput({
    name,
    description,
    value,
    setValue,
    multiline = false,
    disabled = false,
}: {
    name: string;
    description?: string;
    value: string;
    setValue: (value: string) => void;
    multiline?: boolean;
    disabled?: boolean;
}) {
    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1, width: "100%", pb: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
                    {name}
                </Typography>
                {description &&
                    <Tooltip title={description}>
                        <IconButton sx={{ p: 0.6 }}>
                            <InfoOutlineRoundedIcon fontSize="small" color="info" />
                        </IconButton>
                    </Tooltip>
                }
            </Box>
            <TextField
                fullWidth
                multiline={multiline}
                minRows={3}
                maxRows={8}
                value={value || ""}
                onChange={(e) => setValue(removeComments(e.target.value))}
                disabled={disabled}
            />
        </Box>
    )
}


export function LsItem({
    name,
    data,
    onClick,
}: {
    name: string;
    data: boolean | null | undefined;
    onClick: (() => void) | null;
}) {
    return (
        <ListItem>
            <ListItemIcon sx={{ mr: 3 }}>
                {data
                    ? <CheckCircleRoundedIcon color="success" fontSize="large" />
                    : <RadioButtonUncheckedRoundedIcon fontSize="large" color="disabled" />
                }
            </ListItemIcon>
            <ListItemText>
                <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                    {name}
                </Typography>
            </ListItemText>
            {onClick !== null &&
                <ListItemIcon>
                    <IconButton onClick={onClick}>
                        <BorderColorRoundedIcon color="primary" />
                    </IconButton>
                </ListItemIcon>
            }
        </ListItem>
    )
}
