import {
    TextField,
    Chip,
    Box,
    InputAdornment,
} from "@mui/material";

import { useState } from "react";

import type { CursorGet, Perpage, PageProps, SortType, CursorFilter, CursorRes } from "~/model/cursor";
import type { Layer } from "~/model/enum";

import { api } from "~/hooks/api";
import { pushError } from "~/components/error_popout";


export async function cursorSelect(
    newPage: number,
    oldPage: number,
    nextCursor: CursorGet,
    nowProps: PageProps,
) {
    if (newPage === oldPage)
        return null;
    if (newPage === oldPage + 1 && nowProps.sort === nextCursor.sort)
        return nextCursor;
    else
        return { ...nowProps, page: newPage };
}

export async function changePage<T>(
    newPage: number,
    oldPage: number,
    nextCursor: CursorGet,
    nowProps: PageProps,
    filter: CursorFilter,
    getNewList: (cursor: CursorGet, filter?: CursorFilter) => Promise<CursorRes<T> | undefined>
) {
    const cursor = await cursorSelect(newPage, oldPage, nextCursor, nowProps);
    if (!cursor)
        return null;
    const res = await getNewList(cursor, filter);
    if (!res)
        return null;
    else
        return res;
}

export function fetchParams(params: URLSearchParams,) {
    const page = parseInt(params.get("page") || "1", 10);
    const per_page = parseInt(params.get("per_page") || "20", 10) as Perpage;
    const sort = (params.get("sort") || "create_time DESC") as SortType;

    return { page, per_page, sort };
}

export function updateParams(params: URLSearchParams, newParams: PageProps) {
    const res = new URLSearchParams(params);
    res.set("page", String(newParams.page));
    res.set("per_page", String(newParams.per_page));
    res.set("sort", newParams.sort);
    return res;
}

export async function getTotalPages(table: Layer, filter?: CursorFilter, accounts?: number[]) {
    try {
        const res = api.post(
            "/api/statistics/total_lines",
            {
                json: filter ?? {},
                searchParams: { table, accounts: accounts?.join(",") },
            }
        ).json<number>()
        return res;
    }
    catch (err) { pushError(err, `Fetch total ${table} items`); }
}

export function ChipInput({
    value,
    setValue,
    disabled
}: {
    value: string[];
    setValue: (tags: string[]) => void;
    disabled?: boolean;
}) {
    const [input, setInput] = useState("");

    return (
        <TextField
            disabled={disabled}
            fullWidth
            value={input}
            onChange={(e) => setInput(e.target.value)}
            slotProps={{
                htmlInput: {
                    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter") {
                            e.preventDefault();

                            const parts = input.split(/\s+/);

                            const newTags = parts
                                .map(t => t.trim())
                                .filter(Boolean)
                                .filter(t =>
                                    !value.some(x => x.toLowerCase() === t.toLowerCase())
                                );

                            setValue([...value, ...newTags]);
                            setInput("");
                        }
                    },
                },
                input: {
                    startAdornment: (
                        <InputAdornment position="start">
                            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "nowrap" }}>
                                {value.map((tag, i) => (
                                    <Chip
                                        key={tag + i}
                                        label={tag}
                                        size="small"
                                        onDelete={() =>
                                            setValue(value.filter((_, idx) => idx !== i))
                                        }
                                    />
                                ))}
                            </Box>
                        </InputAdornment>
                    ),
                },
            }}
        />
    );
}