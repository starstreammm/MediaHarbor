import {
    Dialog,
    DialogTitle,
    DialogContent,
    Typography,
    Box,
    Divider,
    Fab,
    IconButton,
} from "@mui/material";
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SwapVertRoundedIcon from '@mui/icons-material/SwapVertRounded';

import { useState, useEffect } from "react";

import type { TablePost } from "~/model/table";
import { useLocalStorage } from "~/hooks/storage";
import { ViewTypeSelector, type ViewType } from "~/components/view_selector";
import { ListView, CardView } from "~/pages/posts/views";
import { getPostDetail, getSingleCollection } from "~/function/collection";
import { AppendPostComponent } from "./add_index";



export function CollectionPostsView({ uid, title, uids, onClose }: {
    uid: number;
    title: string;
    uids: number[];
    onClose: () => void;
}) {
    const [posts, setPosts] = useState<TablePost[]>([]);
    const [viewType, setViewType] = useLocalStorage<ViewType>("post_view", "list", "local");
    const [reverse, setReverse] = useState(false);



    const getPostsDetail = (uids: number[]) => {
        Promise.allSettled(uids.map((uid) => getPostDetail(uid)))
            .then((results) =>
                setPosts(results
                    .filter((result) => result.status === "fulfilled")
                    .map((result) => (result as PromiseFulfilledResult<TablePost>).value))
            );
    }

    const handleRefresh = () => {
        getSingleCollection(uid)
            .then((collection) => {
                if (collection)
                    getPostsDetail(collection.posts);
            });
    }

    useEffect(() => { getPostsDetail(uids); }, [, uids]);

    return (
        <Dialog open fullScreen onClose={onClose}>
            <DialogTitle>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Box sx={{ display: "flex", gap: 3, alignItems: "center" }}>
                        <Typography variant="h5">
                            {title}
                        </Typography>
                        <Typography variant="body1" color="textSecondary">
                            {posts.length} posts
                        </Typography>
                    </Box>
                    <Fab size="small" onClick={onClose}>
                        <CloseRoundedIcon />
                    </Fab>
                </Box>
            </DialogTitle>
            <Divider />
            <DialogContent sx={{ p: 0 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <ViewTypeSelector
                        value={viewType}
                        onChange={(newValue) => setViewType(newValue)}
                    />
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <AppendPostComponent uid={uid} onChange={handleRefresh} />
                        <IconButton
                            sx={{ mr: 1 }}
                            onClick={() => setReverse((prev) => !prev)}
                        >
                            <SwapVertRoundedIcon
                                sx={{
                                    transform: reverse ? "rotateX(180deg)" : "rotateX(0deg)",
                                    transition: "transform 333ms ease",
                                }}
                            />
                        </IconButton>
                    </Box>
                </Box>
                <Divider />
                <Box sx={{
                    display: "flex",
                    width: "100%",
                    height: "100%",
                    overflowY: "auto",
                }} >
                    {viewType === "list" && <ListView data={reverse ? posts.reverse() : posts} setData={setPosts} />}
                    {viewType === "grid" && <CardView data={reverse ? posts.reverse() : posts} setData={setPosts} />}
                </Box>
            </DialogContent>
        </Dialog>
    );
}