import {
    Box,
    IconButton,
    Tooltip,
    Divider,
    Pagination,
    Autocomplete,
    TextField,
    useMediaQuery,
} from "@mui/material";
import FilterAltRoundedIcon from '@mui/icons-material/FilterAltRounded';
import CleaningServicesRoundedIcon from '@mui/icons-material/CleaningServicesRounded';

import { useState, useRef, useEffect } from "react";

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
    const nextCursor = useRef<CursorGet>(DefaultCursor);
    const [page, setPage] = useState<PageProps>(defaultPage);
    const [total, setTotal] = useState(1);

    // data
    const [filter, setFilter] = useState<CursorFilter>({});
    const [data, setData] = useState<T[]>([]);



    // Cursor Reset & Fetch
    const fetchData = async (pageProp: PageProps) => {
        const [total, res] = await Promise.all([
            getTotalPages(filter),
            getData(pageProp, filter),
        ]);

        setTotal(total ?? 1);

        if (!res) return;
        const { data, ...page } = res;
        setData(data);
        nextCursor.current = page;
        setPage(pageProp);
    }

    // Fetch total pages and data when the component mounts
    useEffect(() => {
        fetchData(page);
        if (!isUpMd)
            setViewType("grid");
    }, []);

    // Any of the filter, per_page or  sort changes, reset the page to 1 and fetch new data
    useEffect(() => { fetchData({ ...page, page: 1 }); }, [filter, page.sort, page.per_page]);

    // Call onChangePage callback whenever the page state changes
    useEffect(() => onChangePage?.(page), [page]);



    return (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {header}
            <FilterSetter
                open={openFilterEdit}
                setClose={() => setOpenFilterEdit(false)}
                setValue={(newFilter) => setFilter(newFilter)}
                layer={layer}
            />

            <Box sx={{ display: "flex", justifyContent: "space-between", px: viewControlerPadding }}>
                <ViewTypeSelector
                    value={viewType}
                    onChange={(newValue) => setViewType(newValue)}
                />
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <ResponsiveSearch onEnd={(values) => setFilter({ include: values })} />
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
                        setMode={(newSort) => setPage((prev) => ({ ...prev, sort: newSort }))}
                        layer={layer}
                    />
                    {moreControler}
                </Box>
            </Box>
            <Divider sx={{ mx: viewControlerPadding }} />

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
                    count={Math.ceil(total / page.per_page)}
                    page={page.page}
                    onChange={(_, newPage) => {
                        if (newPage !== page.page) {
                            getPageChange(newPage, page.page, nextCursor.current, page, filter)
                                .then((res) => {
                                    if (!res) return;
                                    const { data, ...page } = res;
                                    setData(data);
                                    nextCursor.current = page;
                                    setPage(((prev) => ({ ...prev, page: newPage })));
                                })
                        }
                    }}
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
                        setPage((prev) => ({ ...prev, per_page: newValue }));
                    }}
                    renderInput={(params) => <TextField {...params} variant="standard" />}
                />
            </Box>
        </Box>
    );
}