import {
    Box,
    MenuList,
    MenuItem,
    Checkbox,
    Typography,
    Slider,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    IconButton,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Collapse,
    Switch,
    Popper,
    Paper,
} from "@mui/material";
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import CleaningServicesRoundedIcon from '@mui/icons-material/CleaningServicesRounded';
import FormatLineSpacingRoundedIcon from '@mui/icons-material/FormatLineSpacingRounded';

import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';

import { Fragment, useState } from "react";

import { type CursorFilter, SortType } from "~/model/cursor";
import { ChipInput } from "~/hooks/cursor";
import { Layer, Platform } from "~/model/enum";


const disabled: Record<Layer, string[]> = {
    "creators": ["platform", "post_time"],
    "accounts": ["post_time"],
    "posts": ["alias"],
    "collections": ["overview", "rate", "platform", "post_time"],
    "files": [],
    "queue": ["overview", "rate", "platform", "post_time"],
}



export function FilterSetter({ open, setValue, setClose, layer }: {
    open: boolean;
    setValue: (filter: CursorFilter) => void;
    setClose: () => void;
    layer: Layer;
}) {
    const [extend, setExtend] = useState(-1);
    const [filter, setFilter] = useState<CursorFilter>({});
    const [include, setInclude] = useState<string[]>([]);

    return (
        <Dialog open={open} onClose={setClose} fullWidth>
            <DialogTitle>Filters</DialogTitle>
            <DialogContent>
                <List>
                    {([
                        ["Platform", ["platform"],
                            <MenuList>
                                {
                                    Platform.map((platform) =>
                                        <MenuItem
                                            key={platform}
                                            disableRipple={!include.includes("platform")}
                                            onClick={() => {
                                                setFilter((prev) => {
                                                    const newPlatform = prev.platform?.includes(platform)
                                                        ? prev.platform.filter((p) => p !== platform)
                                                        : [...(prev.platform ?? []), platform];
                                                    return {
                                                        ...prev,
                                                        platform: newPlatform.length ? newPlatform : undefined,
                                                    }
                                                });
                                            }}>
                                            <Checkbox
                                                checked={!(filter.platform?.includes(platform) ?? false)}
                                                tabIndex={-1}
                                                disabled={!include.includes("platform")}
                                                sx={{ mr: 3 }}
                                            />
                                            <ListItemText>
                                                {platform}
                                            </ListItemText>
                                        </MenuItem>
                                    )
                                }
                            </MenuList>
                        ],
                        ["Overview", ["include", "exclude"],
                            <>
                                {(["include", "exclude"] as const).map((type) => (
                                    <>
                                        <Box sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            width: "100%",
                                            px: { xs: 1, md: 3 },
                                            py: 1,
                                            gap: 1,
                                        }}>
                                            <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                                                {type === "include" ? "Include" : "Exclude"}
                                            </Typography>
                                            <Button
                                                disabled={!include.includes(type) || (filter?.[type]?.length ?? 0) === 0}
                                                size="small"
                                                variant="outlined"
                                                onClick={() => {
                                                    setFilter((prev) => ({
                                                        ...prev,
                                                        [type]: [],
                                                    }));
                                                }}
                                            >
                                                Reset
                                            </Button>
                                        </Box>
                                        <ChipInput
                                            disabled={!include.includes(type)}
                                            value={filter?.[type] ?? []}
                                            setValue={(tags) => {
                                                setFilter((prev) => ({
                                                    ...prev,
                                                    [type]: tags,
                                                }));
                                            }}
                                        />
                                    </>
                                ))}
                            </>
                        ],
                        ["Alias", ["alias"],
                            <Box sx={{
                                display: "flex",
                                alignItems: "center",
                                width: "100%",
                                px: { xs: 1, md: 3 },
                                py: 1,
                            }}>
                                <ChipInput
                                    value={filter?.alias ? [filter.alias] : []}
                                    setValue={(tags) => {
                                        setFilter((prev) => ({
                                            ...prev,
                                            alias: tags[0],
                                        }));
                                    }}
                                />
                                <IconButton onClick={() => {
                                    setFilter((prev) => ({
                                        ...prev,
                                        alias: undefined,
                                    }));
                                }}>
                                    <CleaningServicesRoundedIcon fontSize="small" />
                                </IconButton>
                            </Box>
                        ],
                        ["Create Time", ["time"],
                            <LocalizationProvider dateAdapter={AdapterDayjs}>
                                <Box sx={{
                                    width: "100%",
                                    display: "flex",
                                    flexDirection: { xs: "column", md: "row" },
                                    alignContent: "center",
                                    justifyContent: { xs: "flex-start", md: "space-between" },
                                    gap: { xs: 1, md: 0 },
                                    py: 1,
                                }}>
                                    <DatePicker
                                        disabled={!include.includes("time")}
                                        label="Start Date"
                                        value={filter?.time ? dayjs(filter?.time?.split("_")[0]) : null}
                                        onChange={(date) => {
                                            const endTime = filter?.time?.split("_")[1];
                                            setFilter((prev) => ({
                                                ...prev,
                                                time: `${date ? date.format("YYYY-MM-DD") : "1970-01-01"}_${endTime ?? ""}`,
                                            }));
                                        }}
                                    />
                                    <DatePicker
                                        disabled={!include.includes("time")}
                                        label="End Date"
                                        value={filter?.time ? dayjs(filter?.time?.split("_")[1]) : null}
                                        onChange={(date) => {
                                            const startTime = filter?.time?.split("_")[0];
                                            setFilter((prev) => ({
                                                ...prev,
                                                time: `${startTime ?? ""}_${date ? date.format("YYYY-MM-DD") : "2999-12-31"}`,
                                            }));
                                        }}
                                    />
                                </Box>
                            </LocalizationProvider>
                        ],
                        ["Rate", ["rate"],
                            <Box sx={{
                                display: "flex",
                                width: "100%",
                                px: { xs: 1, md: 3 },
                                py: 6,
                            }}>
                                <Slider
                                    disabled={!include.includes("rate")}
                                    value={filter?.rate?.split("-").map(Number) ?? [0, 5]}
                                    onChange={(event, newValue) => {
                                        setFilter((prev) => ({
                                            ...prev,
                                            rate: `${newValue[0]}-${newValue[1]}`,
                                        }));
                                    }}
                                    valueLabelDisplay="on"
                                    step={1}
                                    min={0}
                                    max={5}
                                />
                            </Box>
                        ]
                    ] as [string, string[], React.ReactElement][]).filter(([label, keys, component]) => !disabled[layer].includes(keys[0])).map(([label, keys, component], index) => (
                        <Fragment key={label}>
                            <ListItemButton
                                key={label}
                                onClick={() => setExtend((prev) => prev === index ? -1 : index)}
                                selected={extend === index}
                            >
                                <ListItemIcon>
                                    <Switch
                                        checked={include.includes(keys[0])}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(_, checked) => {
                                            setInclude((prev) =>
                                                checked
                                                    ? [...prev, ...keys]
                                                    : prev.filter((k) => !keys.includes(k))
                                            );
                                        }}
                                    />
                                </ListItemIcon>
                                <ListItemText>
                                    {label}
                                </ListItemText>
                                <ListItemIcon>
                                    {extend === index ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                                </ListItemIcon>
                            </ListItemButton>
                            <Collapse in={extend === index} timeout="auto" unmountOnExit>
                                {component}
                            </Collapse>
                        </Fragment>
                    ))}
                </List>
            </DialogContent>
            <DialogActions>
                <Button onClick={setClose} variant="outlined">
                    Cancel
                </Button>
                <Button onClick={() => {
                    setValue({
                        ...Object.fromEntries(Object.entries(filter).filter(([key]) => include.includes(key))),
                        platform: include.includes("platform") ? filter.platform : [],
                    });
                    setClose();
                }} variant="contained">
                    Apply
                </Button>
            </DialogActions>
        </Dialog>
    );
}



export function SortModeSetter({ mode, setMode, layer }: {
    mode: SortType;
    setMode: (mode: SortType) => void;
    layer: Layer;
}) {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    return (
        <Box onMouseLeave={() => setAnchorEl(null)} sx={{ display: "inline-flex" }} >
            <IconButton onMouseEnter={(event) => setAnchorEl(event.currentTarget)}>
                <FormatLineSpacingRoundedIcon fontSize="small" />
            </IconButton>

            <Popper
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                placement="bottom-start"
                sx={{ pt: 1, zIndex: 1300 }}
            >
                <Paper elevation={13}>
                    <MenuList>
                        {SortType.filter((sort) => disabled[layer].every((d) => !sort.includes(d))).map((sort) =>
                            <MenuItem
                                key={sort}
                                selected={mode === sort}
                                onClick={() => {
                                    setMode(sort);
                                    setAnchorEl(null);
                                }}
                            >
                                {sort}
                            </MenuItem>
                        )}
                    </MenuList>
                </Paper>
            </Popper>
        </Box >
    );
}