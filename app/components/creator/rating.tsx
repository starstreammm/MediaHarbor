import { Rating } from "@mui/material";

import type { SxProps, Theme } from "@mui/material";

import type { DetailsCreator } from "~/model/table";
import { updateCreators } from "~/function/creator";

export default function CreatorRating({ uid, creator, onChange, sx }: {
    uid: number;
    creator: DetailsCreator;
    onChange: (newValue: number) => void;
    sx?: SxProps<Theme>;
}) {
    return (
        <Rating
            value={creator.rate}
            onChange={(_, newValue) => {
                if (newValue === null || newValue === 0) return;
                onChange(newValue);
                updateCreators(uid, { ...creator, rate: newValue });
            }}
            onClick={(e) => e.stopPropagation()}
            sx={sx}
        />
    );
}