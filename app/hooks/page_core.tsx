import {
    Box,
    IconButton,
    Tooltip,
    Divider,
    Pagination,
    Autocomplete,
    TextField,
    useMediaQuery,
    Alert,
} from "@mui/material";
import FilterAltRoundedIcon from '@mui/icons-material/FilterAltRounded';
import CleaningServicesRoundedIcon from '@mui/icons-material/CleaningServicesRounded';

import { useState, useRef, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router";

import type { CursorFilter, CursorGet, CursorRes, PageProps } from "~/model/cursor";
import type { Layer } from "~/model/enum";
import { DefaultCursor, Perpage } from "~/model/cursor";

import { useLocalStorage } from "~/hooks/storage";
import { ViewTypeSelector, type ViewType } from "~/components/view_selector";
import { FilterSetter, SortModeSetter } from "~/components/filter";
import ResponsiveSearch from "~/components/search";



export interface PageCoreOptionalProps<T> {
    header?: React.ReactNode;
    viewControlerPadding?: number;
    defaultPage?: PageProps;
    onChangePage?: (newPage: PageProps) => void;
    onClick?: (selected: T) => void;
}


export default function PageCore<T>(
    {
        layer,
        getTotalPages,
        getData,
        getPageChange,
        ListView,
        CardView,
        StageView,
        header,
        moreControler,
        viewControlerPadding = 0,
        defaultPage = DefaultCursor,
        onChangePage,
        onClick,
    }: {
        layer: Layer;
        getTotalPages: (filter: CursorFilter) => Promise<number | undefined>;
        getData: (cursor: CursorGet, filter?: CursorFilter) => Promise<CursorRes<T> | undefined>;
        getPageChange: (
            newPage: number,
            oldPage: number,
            nextCursor: CursorGet,
            nowProps: PageProps,
            filter: CursorFilter
        ) => Promise<CursorRes<T> | undefined | null>;
        ListView: React.ComponentType<{
            data: T[];
            setData: React.Dispatch<React.SetStateAction<T[]>>;
            onClick?: (selected: T) => void;
        }>;
        CardView: React.ComponentType<{
            data: T[];
            setData: React.Dispatch<React.SetStateAction<T[]>>;
            onClick?: (selected: T) => void;
        }>;
        StageView?: React.ComponentType<{
            data: T[];
            setData: React.Dispatch<React.SetStateAction<T[]>>;
            onClick?: (selected: T) => void;
        }>;
        header?: React.ReactNode;
        moreControler?: React.ReactNode;
        viewControlerPadding?: number;
        defaultPage?: PageProps;
        onChangePage?: (newPage: PageProps) => void;
        onClick?: (selected: T) => void;
    }
) {
    // state
    const isUpMd = useMediaQuery((theme) => theme.breakpoints.up('md'), { noSsr: true });
    const [viewType, setViewType] = useLocalStorage<ViewType>(`${layer}_viewType`, "list", "local");
    const [openFilterEdit, setOpenFilterEdit] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const nextCursor = useRef<CursorGet>(DefaultCursor);
    const previousRequest = useRef<{ key: string; page: number } | null>(null);
    const [localPage, setLocalPage] = useState<PageProps>(defaultPage);
    const page = onChangePage ? defaultPage : localPage;
    const setPage = (newPage: PageProps) => {
        if (onChangePage) onChangePage(newPage);
        else setLocalPage(newPage);
    };
    const [total, setTotal] = useState(1);

    // Top-level searches live in the URL; embedded lists keep their own search.
    const [localFilter, setLocalFilter] = useState<CursorFilter>({});
    const query = onChangePage ? searchParams.get("q") ?? "" : "";
    const filter = useMemo(() => onChangePage
        ? { ...localFilter, search: query.split(/\s+/).filter(Boolean) }
        : localFilter, [localFilter, query, Boolean(onChangePage)]);
    const [data, setData] = useState<T[]>([]);
    const [error, setError] = useState<string | null>(null);

    const setFilter = (newFilter: CursorFilter) => {
        setLocalFilter(newFilter);
        if (onChangePage) {
            setSearchParams((prev) => {
                const params = new URLSearchParams(prev);
                const search = newFilter.search?.join(" ") ?? "";
                if (search) params.set("q", search);
                else params.delete("q");
                params.set("page", "1");
                return params;
            });
        } else {
            setLocalPage((prev) => ({ ...prev, page: 1 }));
        }
    };

    useEffect(() => {
        if (!isUpMd) setViewType("grid");
    }, []);

    useEffect(() => {
        let cancelled = false;
        const key = JSON.stringify([filter, page.sort, page.per_page]);
        const previous = previousRequest.current;
        const request = previous?.key === key && previous.page !== page.page
            ? getPageChange(page.page, previous.page, nextCursor.current, page, filter)
            : getData(page, filter);
        setError(null);
        Promise.all([getTotalPages(filter), request]).then(([total, result]) => {
            if (cancelled || !result) return;
            setTotal(total ?? 0);
            setData(result.data);
            nextCursor.current = result;
            previousRequest.current = { key, page: page.page };
        }).catch((error: unknown) => {
            if (cancelled) return;
            setData([]);
            setTotal(0);
            setError(error instanceof Error ? error.message : "Unable to load results.");
        });
        return () => { cancelled = true; };
    }, [filter, page.page, page.sort, page.per_page]);

    return (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {header}
            {openFilterEdit && <FilterSetter
                open
                value={filter}
                setClose={() => setOpenFilterEdit(false)}
                setValue={(newFilter) => setFilter(newFilter)}
                layer={layer}
            />}

            <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 1, px: viewControlerPadding }}>
                <ViewTypeSelector
                    value={viewType}
                    onChange={(newValue) => setViewType(newValue)}
                />
                <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1 }}>
                    <ResponsiveSearch
                        value={filter.search ?? []}
                        onEnd={(search) => setFilter({ ...filter, search })}
                    />
                    <IconButton onClick={() => setOpenFilterEdit(true)}>
                        <FilterAltRoundedIcon fontSize="small" />
                    </IconButton>
                    <Tooltip title="Clear all filters">
                        <IconButton onClick={() => setFilter({})}>
                            <CleaningServicesRoundedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Divider orientation="vertical" />
                    <SortModeSetter
                        mode={page.sort}
                        setMode={(newSort) => setPage({ ...page, page: 1, sort: newSort })}
                        layer={layer}
                    />
                    {moreControler}
                </Box>
            </Box>
            <Divider sx={{ mx: viewControlerPadding }} />

            {error && <Alert severity="error">{error}</Alert>}
            <Box sx={{
                display: "flex",
                width: "100%",
                flex: 1,
                overflowY: "auto",
                minHeight: 0,

                scrollbarWidth: 'none',     // Firefox
                msOverflowStyle: 'none',    // IE 10+
                '&::-webkit-scrollbar': {   // Chrome / Safari
                    display: 'none',
                },
            }} >
                {viewType === "list" && <ListView data={data} setData={setData} onClick={onClick} />}
                {viewType === "grid" && <CardView data={data} setData={setData} onClick={onClick} />}
                {viewType === "stage" && <></>}
            </Box >

            <Box sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                py: 1,
                gap: 3,
            }}>
                <Pagination
                    count={Math.max(1, Math.ceil(total / page.per_page))}
                    page={page.page}
                    onChange={(_, newPage) => setPage({ ...page, page: newPage })}
                    color="primary"
                />
                <Autocomplete
                    value={page.per_page}
                    autoComplete
                    disableClearable
                    options={Perpage}
                    getOptionLabel={(option) => String(option)}
                    sx={{ width: 58 }}
                    onChange={(_, newValue) => {
                        if (newValue === null) return;
                        setPage({ ...page, page: 1, per_page: newValue });
                    }}
                    renderInput={(params) => <TextField {...params} variant="standard" />}
                />
            </Box>
        </Box>
    );
}