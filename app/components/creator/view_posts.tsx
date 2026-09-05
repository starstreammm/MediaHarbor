import { Dialog, DialogContent, IconButton, Divider } from "@mui/material";
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

import type { TablePost } from "~/model/table";
import PageCore from "~/hooks/page_core";
import { getTotalPages, cursorSelect } from "~/hooks/cursor";
import { ListView, CardView } from "~/pages/posts/views";
import { getPostsLs } from "~/function/creator";



export default function ViewPostsDialog({ open, onClose, accounts }: {
    open: boolean;
    onClose: () => void;
    accounts: number[];
}) {
    return (
        <Dialog open={open} fullScreen onClose={onClose}>
            <DialogContent sx={{ p: 0 }}>
                <PageCore<TablePost>
                    layer="posts"
                    getTotalPages={(filter) => getTotalPages("posts", filter, accounts)}
                    getData={(cursor, filter) => getPostsLs(accounts, cursor, filter)}
                    getPageChange={(newPage, oldPage, nextCursor, nowProps, filter) =>
                        cursorSelect(newPage, oldPage, nextCursor, nowProps)
                            .then((cursor) => {
                                if (!cursor) return null;
                                return getPostsLs(accounts, cursor, filter);
                            })
                    }
                    ListView={ListView}
                    CardView={CardView}
                    moreControler={
                        <>
                            <Divider orientation="vertical" />
                            <IconButton onClick={onClose} sx={{ mr: 1 }}>
                                <CloseRoundedIcon />
                            </IconButton>
                        </>
                    }
                />
            </DialogContent>
        </Dialog>
    );
}