import { IconButton, Switch, Tooltip } from "@mui/material";
import FilterAltRoundedIcon from '@mui/icons-material/FilterAltRounded';

import {
    useState,
    forwardRef,
    useImperativeHandle,
    type ForwardedRef,
} from "react";

import type { AccountFilter } from "~/model/cursor";
import type { ApiAccountCreate, InsertRef } from "~/model/api";
import { Platform } from "~/model/enum";
import UrlInsert from "../url_list";
import { AccountFilterDialog } from "./filter";
import { checkUrl, createSubmit } from "../../function/account";

export default forwardRef(UrlsInsert);

function UrlsInsert(
    {
        open,
        creator_uid = -1,
    }: {
        open: boolean;
        creator_uid?: number;
    },
    ref: ForwardedRef<InsertRef<ApiAccountCreate[], number[]>>,
) {
    // data
    const [urls, setUrls] = useState<Record<string, string>>({});
    const [filters, setFilters] = useState<Record<string, AccountFilter>>({});
    const [sync, setSync] = useState<Record<string, boolean>>({});

    // state
    const [openFilter, setOpenFilter] = useState("");

    useImperativeHandle(ref, () => ({
        resData() {
            const url_list = Object.keys(urls).filter((url) => Platform.includes(urls[url] as Platform));
            return url_list.map((url) => ({
                url,
                creator_uid,
                filter: filters[url],
                sync: sync[url] === false ? false : true,
            }));
        },
        submit() {
            const url_list = Object.keys(urls).filter((url) => Platform.includes(urls[url] as Platform));
            const tasks = url_list.map((url) => ({
                url,
                creator_uid,
                filter: filters[url],
                sync: sync[url] === false ? false : true,
            }));
            return Promise.all(tasks.map((task) => {
                return createSubmit(task);
            }));
        },
    }));

    return (
        <>
            {openFilter &&
                <AccountFilterDialog
                    filter={filters[openFilter] ?? {}}
                    onClose={(filter) => {
                        setOpenFilter("");
                        if (filter !== null) {
                            setFilters((prev) => ({
                                ...prev,
                                [openFilter]: filter,
                            }));
                        }
                    }}
                />
            }
            <UrlInsert
                open={open}
                urls={urls}
                onChange={setUrls}
                checkUrl={checkUrl}
                optional={(url) => (
                    <>
                        <IconButton onClick={() => setOpenFilter(url)} disabled={sync[url] === false}>
                            <FilterAltRoundedIcon />
                        </IconButton>
                        <Tooltip title="Auto Sync">
                            <Switch onChange={(e) => setSync({ ...sync, [url]: e.target.checked })} />
                        </Tooltip>
                    </>
                )}
            />
        </>
    );
}