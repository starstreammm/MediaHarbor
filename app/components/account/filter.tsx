import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    Typography,
    Switch,
} from "@mui/material";

import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";

import { Fragment, useEffect, useState } from "react";

import type { AccountFilter } from "~/model/cursor";
import { ChipInput } from "~/hooks/cursor";

export function AccountFilterPanel({
    defaultFilter,
    onChange,
}: {
    defaultFilter: AccountFilter;
    onChange: (filter: AccountFilter) => void;
}) {
    const [filter, setFilter] = useState<AccountFilter>(defaultFilter);
    const [include, setInclude] = useState<string[]>(
        Object.keys(defaultFilter).filter((key) => defaultFilter[key as keyof AccountFilter] != null),
    );

    useEffect(() => {
        onChange(
            Object.fromEntries(
                include.map((key) => [key, filter[key as keyof AccountFilter] ?? (key === "time" ? "1970-01-01_2999-12-31" : [])]),
            ) as AccountFilter,
        );
    }, [filter, include]);

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                gap: { xs: 0.5, md: 1 },
            }}
        >
            {(
                [
                    [
                        "Post Time Range (None for unlimited)",
                        "time",
                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                            <Box
                                sx={{
                                    width: "100%",
                                    display: "flex",
                                    flexDirection: { xs: "column", md: "row" },
                                    alignItems: "center",
                                    justifyContent: "flex-start",
                                    gap: 1,
                                }}
                            >
                                <DatePicker
                                    disabled={!include.includes("time")}
                                    label="Start Date"
                                    value={
                                        filter?.time
                                            ? dayjs(filter?.time?.split("_")[0])
                                            : null
                                    }
                                    onChange={(date) => {
                                        const endTime =
                                            filter?.time?.split("_")[1];
                                        setFilter((prev) => ({
                                            ...prev,
                                            time: `${date ? date.format("YYYY-MM-DD") : "1970-01-01"}_${endTime || "2999-12-31"}`,
                                        }));
                                    }}
                                />
                                ---
                                <DatePicker
                                    disabled={!include.includes("time")}
                                    label="End Date"
                                    value={
                                        filter?.time
                                            ? dayjs(filter?.time?.split("_")[1])
                                            : null
                                    }
                                    onChange={(date) => {
                                        const startTime =
                                            filter?.time?.split("_")[0];
                                        setFilter((prev) => ({
                                            ...prev,
                                            time: `${startTime || "1970-01-01"}_${date ? date.format("YYYY-MM-DD") : "2999-12-31"}`,
                                        }));
                                    }}
                                />
                            </Box>
                        </LocalizationProvider>,
                    ],
                    [
                        "Include Keyword(s)",
                        "include",
                        <ChipInput
                            disabled={!include.includes("include")}
                            value={filter.include ?? []}
                            setValue={(tags) => {
                                setFilter((prev) => ({
                                    ...prev,
                                    include: tags,
                                }));
                            }}
                        />,
                    ],
                    [
                        "Exclude Keyword(s)",
                        "exclude",
                        <ChipInput
                            disabled={!include.includes("exclude")}
                            value={filter.exclude ?? []}
                            setValue={(tags) => {
                                setFilter((prev) => ({
                                    ...prev,
                                    exclude: tags,
                                }));
                            }}
                        />,
                    ],
                ] as [string, string, React.ReactElement][]
            ).map(([label, key, component]) => (
                <Fragment key={key}>
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: { xs: 1.5, md: 3 },
                        }}
                    >
                        <Switch
                            slotProps={{ input: { "aria-label": label } }}
                            checked={include.includes(key)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(_, checked) => {
                                setInclude((prev) =>
                                    checked
                                        ? [...prev, key]
                                        : prev.filter((k) => k !== key),
                                );
                            }}
                        />
                        <Typography variant="body1">{label}</Typography>
                    </Box>
                    {component}
                </Fragment>
            ))}
        </Box>
    );
}

export function AccountFilterDialog({
    filter,
    onClose,
}: {
    filter: AccountFilter;
    onClose: (filter: AccountFilter | null) => void;
}) {
    const [tempFilter, setTempFilter] = useState<AccountFilter>(filter);

    return (
        <Dialog
            open
            fullWidth
            onKeyDown={(e) => {
                if (e.key === "Escape") {
                    e.stopPropagation();
                    onClose(null);
                }
                if (e.key === "Enter") {
                    e.stopPropagation();
                    onClose(tempFilter);
                }
            }}
        >
            <DialogTitle>Account Filter</DialogTitle>
            <DialogContent>
                <AccountFilterPanel
                    defaultFilter={filter}
                    onChange={setTempFilter}
                />
            </DialogContent>
            <DialogActions>
                <Box sx={{ display: "flex", gap: 3 }}>
                    <Button onClick={() => onClose(null)} variant="outlined">
                        Cancel
                    </Button>
                    <Button
                        onClick={() => onClose(tempFilter)}
                        variant="contained"
                    >
                        Apply
                    </Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}
