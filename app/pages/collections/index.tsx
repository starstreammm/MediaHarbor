import { Fab } from "@mui/material";
import AddRoundedIcon from '@mui/icons-material/AddRounded';

import { useState } from "react";
import { useOutletContext, useSearchParams } from "react-router";

import type { TableCollection } from "~/model/table";
import PageCore, { type PageCoreOptionalProps } from "~/hooks/page_core";
import { fetchParams, updateParams, getTotalPages, changePage } from "~/hooks/cursor";
import AppBar from "~/components/appbar";
import { AddCollectionDialog } from "~/components/collection/add_index";
import { getCollections } from "~/function/collection";
import { ListView, CardView } from "./view";



export default function Collections() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { mobilDrawer } =
        useOutletContext<{
            appBarHeight: number,
            drawerWidth: number,
            mobilDrawer: () => void,
        }>();

    const [openAdd, setOpenAdd] = useState(false);



    return (
        <CollectionsPageCore
            header={
                <>
                    {openAdd &&
                        <AddCollectionDialog onClose={(uid) => {
                            setOpenAdd(false);
                            if (uid)
                                window.location.reload();
                        }} />
                    }
                    <AppBar mobilDrawer={mobilDrawer} label="Collections" button={
                        <Fab
                            variant="extended"
                            size="medium"
                            color="primary"
                            onClick={() => setOpenAdd(true)}
                        >
                            <AddRoundedIcon sx={{ mr: 1 }} />
                            Add
                        </Fab>
                    } />
                </>
            }
            viewControlerPadding={2}
            defaultPage={fetchParams(searchParams)}
            onChangePage={(newPage) => setSearchParams((prev) => updateParams(prev, newPage))}
        />
    );
}

export function CollectionsPageCore({
    header,
    viewControlerPadding,
    defaultPage,
    onChangePage,
    onClick,
}: PageCoreOptionalProps<TableCollection>) {
    return (
        <PageCore<TableCollection>
            layer="collections"
            getTotalPages={(filter) => getTotalPages("collections", filter)}
            getData={(cursor, filter) => getCollections(cursor, filter)}
            getPageChange={(newPage, oldPage, nextCursor, nowProps, filter) =>
                changePage(newPage, oldPage, nextCursor, nowProps, filter, getCollections)}
            ListView={ListView}
            CardView={CardView}
            header={header}
            viewControlerPadding={viewControlerPadding}
            defaultPage={defaultPage}
            onChangePage={onChangePage}
            onClick={onClick}
        />
    );
}