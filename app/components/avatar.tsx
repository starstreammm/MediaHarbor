import { Avatar, ButtonBase, Tooltip } from "@mui/material";
import WarningRoundedIcon from "@mui/icons-material/WarningRounded";
import { useFileInfo } from "~/hooks/file-info";
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';

import { FileInput } from "~/hooks/file";


export default function UserAvatar({ uid, size = 88, onChange, onClick }: {
    uid: number | null | undefined;
    size?: number;
    onChange?: (newUid: number) => void;
    onClick?: () => void;
}) {
    const info = useFileInfo(uid);

    function Base() {
        if (info.data?.exist === false) {
            return <Tooltip title="Avatar file is missing from storage">
                <Avatar aria-label="Avatar file missing" sx={{ width: size, height: size, bgcolor: "warning.main" }}>
                    <WarningRoundedIcon />
                </Avatar>
            </Tooltip>;
        }
        if (uid && uid >= 0) {
            return (
                <Avatar
                    alt={`UID ${uid}`}
                    src={`/api/file/${uid}`}
                    sx={{ width: size, height: size }}
                    onClick={(e) => {
                        e.stopPropagation();
                        onClick?.();
                    }}
                />
            );
        }
        else {
            return (
                <Avatar sx={{ width: size, height: size }}>
                    <PersonRoundedIcon sx={{ fontSize: size * 0.83 }} />
                </Avatar >
            );
        }
    }

    if (onChange) {
        return (
            <Tooltip title="Click to upload a new avatar">
                <ButtonBase component="label" sx={{ borderRadius: size }}>
                    <Base />
                    <FileInput
                        onEnd={(_, u) => u && u > 0 ? onChange(u) : undefined}
                    />
                </ButtonBase>
            </Tooltip>
        );
    }

    else {
        return <Base />;
    }
}
