import {
    TextField,
    Chip,
    Box,
    InputAdornment,
} from "@mui/material";

import { useState } from "react";

import type { CursorGet, PageProps, CursorFilter, CursorRes } from "~/model/cursor";
import { Perpage as PerpageValues, SortType as SortValues } from "~/model/cursor";
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
    const requestedPage = Number(params.get("page") ?? 1);
    const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const requestedPerPage = Number(params.get("per_page") ?? 20);
    const per_page = PerpageValues.find((value) => value === requestedPerPage) ?? 20;
    const sort = SortValues.find((value) => value === params.get("sort")) ?? "create_time DESC";

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

    const commit = (text: string) => {
        const terms = text.split(/\s+/).filter(Boolean);
        const unique = new Map(value.map((term) => [term.toLowerCase(), term]));
        for (const term of terms) {
            if (!unique.has(term.toLowerCase())) unique.set(term.toLowerCase(), term);
        }
        if (terms.length) setValue([...unique.values()]);
        setInput("");
    };

    return (
        <TextField
            disabled={disabled}
            fullWidth
            value={input}
            onChange={(e) => {
                if (!(e.nativeEvent as InputEvent).isComposing && /\s/.test(e.target.value)) {
                    commit(e.target.value);
                } else {
                    setInput(e.target.value);
                }
            }}
            onBlur={() => commit(input)}
            slotProps={{
                htmlInput: {
                    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            commit(input);
                        }
                    },
                },
                input: {
                    sx: { flexWrap: "wrap", gap: 1 },
                    startAdornment: (
                        <InputAdornment position="start" sx={{ maxWidth: "100%", height: "auto" }}>
                            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                                {value.map((tag, i) => (
                                    <Chip
                                        key={tag + i}
                                        label={tag}
                                        size="small"
                                        sx={{ maxWidth: "100%" }}
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