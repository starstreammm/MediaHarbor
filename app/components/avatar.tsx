import { Avatar, ButtonBase, Tooltip } from "@mui/material";
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';

import { FileInput } from "~/hooks/file";


export default function UserAvatar({ uid, size = 88, onChange, onClick }: {
    uid: number | null | undefined;
    size?: number;
    onChange?: (newUid: number) => void;
    onClick?: () => void;
}) {
    function Base() {
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
                        onEnd={(_, u) => u ? onChange(u) : undefined}
                    />
                </ButtonBase>
            </Tooltip>
        );
    }

    else {
        return <Base />;
    }
}
