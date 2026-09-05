export const ViewType = ["list", "grid", "stage"] as const;
export type ViewType = typeof ViewType[number];

import { ToggleButton, ToggleButtonGroup, Divider, useMediaQuery } from "@mui/material";
import ViewListRoundedIcon from '@mui/icons-material/ViewListRounded';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import ViewSidebarRoundedIcon from '@mui/icons-material/ViewSidebarRounded';


export function ViewTypeSelector({
    value,
    onChange,
}: {
    value: ViewType;
    onChange: (newType: ViewType) => void;
}) {
    const isUpMd = useMediaQuery((theme) => theme.breakpoints.up('md'), { noSsr: true });

    return (
        <ToggleButtonGroup
            value={value}
            exclusive
            onChange={(_, newValue) => {
                if (newValue)
                    onChange(newValue);
            }}
            size="small"
            color="primary"
            sx={{
                border: "none",
                "& .MuiToggleButtonGroup-grouped": {
                    border: "none",
                },
                "& .MuiToggleButtonGroup-grouped.Mui-disabled": {
                    border: "none",
                },
            }}
        >
            <ToggleButton value="list" sx={{ px: 1 }}>
                <ViewListRoundedIcon />
            </ToggleButton>
            <Divider orientation="vertical" variant="middle" flexItem />
            <ToggleButton value="grid" sx={{ px: 1 }}>
                <GridViewRoundedIcon />
            </ToggleButton>
            <Divider orientation="vertical" variant="middle" flexItem />
            <ToggleButton value="stage" sx={{ px: 1 }} disabled>
                <ViewSidebarRoundedIcon />
            </ToggleButton>
        </ToggleButtonGroup>
    )
}