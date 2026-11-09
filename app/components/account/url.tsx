import { Chip, IconButton, Tooltip } from "@mui/material";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";

import {
    useState,
    useEffect,
    forwardRef,
    useImperativeHandle,
    type ForwardedRef,
} from "react";

import type { AccountFilter } from "~/model/cursor";
import type { ApiAccountCreate, InsertRef, UrlCheckState } from "~/model/api";
import UrlInsert from "../url_list";
import { AccountSyncDialog } from "./sync_settings";
import { checkUrl, createSubmit } from "../../function/account";

export default forwardRef(UrlsInsert);

function UrlsInsert(
    {
        open,
        onReady,
        creator_uid = -1,
    }: {
        open: boolean;
        onReady?: (ready: boolean) => void;
        creator_uid?: number;
    },
    ref: ForwardedRef<InsertRef<ApiAccountCreate[], number[]>>,
) {
    // data
    const [urls, setUrls] = useState<Record<string, UrlCheckState>>({});
    const [filters, setFilters] = useState<Record<string, AccountFilter>>({});
    const [sync, setSync] = useState<Record<string, boolean>>({});

    // state
    const [openFilter, setOpenFilter] = useState("");

    const ready = open && Object.values(urls).some((result) => result.status === "passed")
        && !Object.values(urls).some((result) => result.status === "checking");

    useEffect(() => {
        onReady?.(ready);
    }, [onReady, ready]);

    useImperativeHandle(ref, () => ({
        resData() {
            if (!ready) throw new Error("Add at least one valid account and wait for URL checks to finish.");
            const url_list = Object.keys(urls).filter((url) => urls[url].status === "passed");
            return url_list.map((url) => ({
                url,
                creator_uid,
                filter: filters[url],
                sync: sync[url] === false ? false : true,
            }));
        },
        submit() {
            if (!ready) throw new Error("Add at least one valid account and wait for URL checks to finish.");
            const url_list = Object.keys(urls).filter((url) => urls[url].status === "passed");
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
                <AccountSyncDialog
                    defaultEnabled={sync[openFilter] !== false}
                    defaultFilter={filters[openFilter] ?? {}}
                    onClose={() => setOpenFilter("")}
                    onSave={(enabled, filter) => {
                        setSync((previous) => ({ ...previous, [openFilter]: enabled }));
                        setFilters((previous) => ({ ...previous, [openFilter]: filter }));
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
                        <Chip
                            size="small"
                            variant="outlined"
                            color={sync[url] !== false ? "success" : "default"}
                            label={sync[url] !== false ? "Auto sync on" : "Auto sync off"}
                        />
                        <Tooltip title="Sync settings">
                            <IconButton aria-label="Edit sync settings" onClick={() => setOpenFilter(url)}>
                                <MoreVertRoundedIcon />
                            </IconButton>
                        </Tooltip>
                    </>
                )}
            />
        </>
    );
}
