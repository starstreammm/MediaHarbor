import { Fab } from "@mui/material";
import AddRoundedIcon from '@mui/icons-material/AddRounded';

import { useState } from "react";
import { useOutletContext, useSearchParams } from "react-router";

import type { TablePost } from "~/model/table";
import PageCore, { type PageCoreOptionalProps } from "~/hooks/page_core";
import { fetchParams, updateParams, getTotalPages, changePage } from "~/hooks/cursor";
import AppBar from "~/components/appbar";
import AddPostDialog from "~/components/post/add_index";
import { ListView, CardView } from "./views";
import { getPosts } from "../../function/post";



export default function Posts() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { mobilDrawer } =
        useOutletContext<{
            appBarHeight: number,
            drawerWidth: number,
            mobilDrawer: () => void,
        }>();

    const [openAdd, setOpenAdd] = useState(false);


    return (
        <PostsPageCore
            header={
                <>
                    {openAdd && <AddPostDialog onClose={() => setOpenAdd(false)} />}
                    <AppBar mobilDrawer={mobilDrawer} label="Posts" button={
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


export function PostsPageCore({
    header,
    viewControlerPadding,
    defaultPage,
    onChangePage,
    onClick,
}: PageCoreOptionalProps<TablePost>) {

    return (
        <PageCore<TablePost>
            layer="posts"
            getTotalPages={(filter) => getTotalPages("posts", filter)}
            getData={(cursor, filter) => getPosts(cursor, filter)}
            getPageChange={(newPage, oldPage, nextCursor, nowProps, filter) =>
                changePage(newPage, oldPage, nextCursor, nowProps, filter, getPosts)}
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