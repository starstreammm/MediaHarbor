import { Fab } from "@mui/material";
import AddRoundedIcon from '@mui/icons-material/AddRounded';

import { useState } from "react";
import { useOutletContext, useSearchParams } from "react-router";

import type { TableCreator } from "~/model/table";
import PageCore from "~/hooks/page_core";
import { fetchParams, updateParams, getTotalPages, changePage } from "~/hooks/cursor";
import AppBar from "~/components/appbar";
import AddCreatorDialog from "~/components/creator/add_index";
import { getCreators } from "../../function/creator";
import { CardView, ListView } from "./views";



export default function Creators() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { mobilDrawer } =
        useOutletContext<{
            appBarHeight: number,
            drawerWidth: number,
            mobilDrawer: () => void,
        }>();

    const [openAdd, setOpenAdd] = useState(false);



    return (
        <PageCore<TableCreator>
            layer="creators"
            getTotalPages={(filter) => getTotalPages("creators", filter)}
            getData={(cursor, filter) => getCreators(cursor, filter)}
            getPageChange={(newPage, oldPage, nextCursor, nowProps, filter) =>
                changePage(newPage, oldPage, nextCursor, nowProps, filter, getCreators)}
            ListView={ListView}
            CardView={CardView}
            header={
                <>
                    {openAdd && <AddCreatorDialog onClose={() => setOpenAdd(false)} />}
                    <AppBar mobilDrawer={mobilDrawer} label="Creators" button={
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