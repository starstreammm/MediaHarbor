import {
    Box,
    TableContainer,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    CardHeader,
    CardMedia,
    CardContent,
    IconButton,
    Typography,
    Divider,
    Popover,
    Paper,
    MenuList,
    MenuItem,
    Dialog,
    DialogTitle,
    DialogContent,
    Fab,
} from "@mui/material";
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

import { useState, type SetStateAction, type Dispatch, useEffect } from "react";

import type { TablePost } from "~/model/table";
import { GridCardContainer, GridCardItem } from "~/hooks/card_view";
import { downloadFile } from "~/hooks/file";
import { PostView } from "~/components/post/view_index";
import PostRating from "~/components/post/rating";
import DeleteConfirmDialog from "~/components/delete_confirm";
import { pushMsg } from "~/components/error_popout";
import { HoverPlayer } from "~/components/media";
import { CollectionsPageCore } from "~/pages/collections/index";
import { updateCollections } from "~/function/collection";
import { ShowCreatorAvatar } from "./components";
import { getPostCover, deletePost } from "../../function/post";



function ChooseCollectionDialog({ uid, onClose }: {
    uid: number;
    onClose: () => void;
}) {
    return (
        <Dialog open onClose={onClose} fullScreen>
            <DialogTitle>
                <Box sx={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                }}>
                    <Typography variant="h5">
                        Choose a Collection
                    </Typography>
                    <Fab size="small" onClick={onClose}>
                        <CloseRoundedIcon />
                    </Fab>
                </Box>
            </DialogTitle>
            <Divider />
            <DialogContent sx={{ p: 0 }}>
                <CollectionsPageCore onClick={(collection) =>
                    updateCollections({ uid: collection.uid, add: [uid] })
                        .then(() => onClose())
                } />
            </DialogContent>
        </Dialog>
    );
}



function ActionList({ post, setData, anchorEl, onClose }: {
    post: TablePost | null;
    setData: Dispatch<SetStateAction<TablePost[]>>;
    anchorEl: HTMLElement | undefined;
    onClose: () => void;
}) {
    const [openChooseCollection, setOpenChooseCollection] = useState<number | null>(null);
    const [openDelete, setOpenDelete] = useState<[number, string] | null>(null);

    return (
        <>
            {openChooseCollection !== null &&
                <ChooseCollectionDialog
                    uid={openChooseCollection}
                    onClose={() => setOpenChooseCollection(null)}
                />
            }
            {openDelete !== null &&
                <DeleteConfirmDialog
                    onClose={(needDelete) => {
                        if (needDelete)
                            deletePost(openDelete[0])
                                .then(() => setData((prev) => prev.filter((p) => p.uid !== openDelete[0])));
                        setOpenDelete(null);
                    }}
                    confirmKey={openDelete[1]}
                    remind={<>
                        All related data will be deleted, including the <b>files</b> that belong to the post.
                    </>}
                />
            }
            {post !== null &&
                <Popover
                    open={Boolean(anchorEl)}
                    anchorEl={anchorEl}
                    onClose={onClose}
                    sx={{ zIndex: 1300 }}
                    anchorOrigin={{
                        vertical: 'bottom',
                        horizontal: 'right',
                    }}
                    transformOrigin={{
                        vertical: 'top',
                        horizontal: 'right',
                    }}
                >
                    <Paper elevation={13}>
                        <MenuList>
                            {([
                                ["Add to Collection", "", () => setOpenChooseCollection(post.uid)],
                                ["Download", "primary.main", () => {
                                    Promise.allSettled(post.files.map((file) => downloadFile(file as number)));
                                }],
                                ["Delete", "error.main", () => setOpenDelete([post.uid, `UID: ${post.uid}`])],
                            ] as [string, string, () => void][]).map(([text, color, action]) =>
                                <MenuItem
                                    key={text}
                                    onClick={() => {
                                        action();
                                        onClose();
                                    }}
                                    sx={{ color }}
                                >
                                    {text}
                                </MenuItem>
                            )}
                        </MenuList>
                    </Paper>
                </Popover>
            }
        </>
    );
}


export function ViewCore({ component, data, setData }: {
    component: (
        setOpenIndex: Dispatch<SetStateAction<number | null>>,
        setActionAnchor: Dispatch<SetStateAction<[HTMLElement, number] | null>>
    ) => React.ReactElement;
    data: TablePost[];
    setData: Dispatch<SetStateAction<TablePost[]>>;
}) {
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const [actionAnchor, setActionAnchor] = useState<[HTMLElement, number] | null>(null);

    return (
        <>
            {openIndex !== null &&
                <PostView
                    post={data[openIndex]}
                    setPost={(newPost) => setData((prev) => prev.map((p) => p.uid === newPost.uid ? newPost : p))}
                    onClose={() => setOpenIndex(null)}
                    onNext={() => setOpenIndex((prev) => {
                        if (prev === null)
                            return null;
                        if (prev < data.length - 1)
                            return prev + 1;
                        else {
                            pushMsg("This is the last post.", "info");
                            return prev;
                        }
                    })}
                    onLast={() => setOpenIndex((prev) => {
                        if (prev === null)
                            return null;
                        if (prev > 0)
                            return prev - 1;
                        else {
                            pushMsg("This is the first post.", "info");
                            return prev;
                        }
                    })}
                />
            }
            <ActionList
                post={actionAnchor !== null ? data[actionAnchor[1]] : null}
                setData={setData}
                anchorEl={actionAnchor?.[0]}
                onClose={() => setActionAnchor(null)}
            />
            {component(setOpenIndex, setActionAnchor)}
        </>
    )
}


export function ListView({ data, setData }: {
    data: TablePost[];
    setData: Dispatch<SetStateAction<TablePost[]>>;
}) {
    return (
        <ViewCore component={(setOpenIndex, setActionAnchor) =>
            <TableContainer sx={{
                scrollbarWidth: 'none',     // Firefox
                msOverflowStyle: 'none',    // IE 10+
                '&::-webkit-scrollbar': {   // Chrome / Safari
                    display: 'none',
                },
            }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Platform</TableCell>
                            <TableCell sx={{ width: "100%", minWidth: 188 }}>Overview</TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>Post Time</TableCell>
                            <TableCell>Creator</TableCell>
                            <TableCell>Rate</TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }} align='center'>Files Count</TableCell>
                            <TableCell />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.map((post, index) => (
                            <TableRow key={post.uid} onClick={() => setOpenIndex(index)} sx={{ cursor: "pointer" }}>
                                <TableCell>{post.platform?.toUpperCase()}</TableCell>
                                <TableCell sx={{ overflowWrap: "anywhere" }}>{post.overview}</TableCell>
                                <TableCell sx={{ whiteSpace: "nowrap" }}>
                                    {new Date(post.post_time).toLocaleString()}
                                </TableCell>
                                <TableCell>
                                    <ShowCreatorAvatar account_uid={post?.account_uid} />
                                </TableCell>
                                <TableCell>
                                    <PostRating uid={post.uid} rate={post.rate} onChange={(newValue) => {
                                        setData((prev) => prev.map((p, i) => i === index ? { ...p, rate: newValue } : p));
                                    }} />
                                </TableCell>
                                <TableCell sx={{ whiteSpace: "nowrap" }} align='center'>{post.files.length}</TableCell>
                                <TableCell>
                                    <IconButton
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActionAnchor([e.currentTarget, index]);
                                        }}
                                    >
                                        <MoreVertRoundedIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        } data={data} setData={setData} />
    );
}


export function CardView({ data, setData }: {
    data: TablePost[];
    setData: Dispatch<SetStateAction<TablePost[]>>;
}) {
    const [cover, setCover] = useState<number[]>([]);
    const [size, setSize] = useState(3);
    const [showDetail, setShowDetail] = useState(false);


    useEffect(() => {
        Promise.allSettled(data.map((post) => {
            if (post.files.length === 0)
                return Promise.resolve(-3);
            else
                return getPostCover(post.uid);
        })).then((res) => setCover(res.map((r) => r.status === "fulfilled" ? r.value : -3)));
    }, [, data]);


    return (
        <ViewCore component={(setOpenIndex, setActionAnchor) =>
            <GridCardContainer setSize={setSize} setShowDetail={setShowDetail}>
                {data.map((post, index) => (
                    <GridCardItem key={post.uid} size={size} onClick={() => setOpenIndex(index)}>
                        <CardHeader
                            avatar={<ShowCreatorAvatar account_uid={post?.account_uid} size={43} />}
                            action={
                                <IconButton onClick={(e) => {
                                    e.stopPropagation();
                                    setActionAnchor([e.currentTarget, index]);
                                }}>
                                    <MoreVertRoundedIcon />
                                </IconButton>
                            }
                            title={
                                <PostRating uid={post.uid} rate={post.rate} onChange={(newValue) => {
                                    setData((prev) => prev.map((p, i) => i === index ? { ...p, rate: newValue } : p));
                                }} />}
                            subheader={new Date(post.post_time).toLocaleString()}
                        />
                        {cover[index] >= 0
                            ? <CardMedia
                                component={"img"}
                                sx={{
                                    aspectRatio: "16/9",
                                    objectFit: "cover",
                                    transition: "transform 333ms ease",
                                    "&:hover": {
                                        transform: "scale(1.08)",
                                    },
                                }}
                                image={`/api/file/${cover[index]}`}
                                alt={`File UID ${cover[index]}`}
                            />
                            : <CardMedia sx={{
                                width: "100%",
                                aspectRatio: "16/9",
                                objectFit: "cover",
                                bgcolor: "black",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}>
                                {cover[index] === -1
                                    ? <HoverPlayer uid={post.files[0] as number} />
                                    : <Typography variant="body1" sx={{ color: "white" }}>
                                        Unknown Media Type
                                    </Typography>
                                }
                            </CardMedia>
                        }
                        <CardContent>
                            <Typography variant="body1" sx={{ overflowWrap: "anywhere" }}>
                                {post.overview}
                            </Typography>
                            {showDetail &&
                                <>
                                    <Divider sx={{ my: 1 }} />
                                    <Box sx={{ display: "flex", flexDirection: "row", gap: 1.8 }}>
                                        {[
                                            post.platform?.toUpperCase(),
                                            `UID: ${post.uid}`,
                                            `Files: ${post.files.length}`
                                        ].map(text =>
                                            <Typography key={text} variant="body2" sx={{ color: "text.secondary" }}>
                                                {text}
                                            </Typography>
                                        )}
                                    </Box>
                                    <Typography variant="body2" sx={{ overflowWrap: "anywhere", color: "text.secondary" }}>
                                        PID: {post.pid}
                                    </Typography>
                                </>
                            }
                        </CardContent>
                    </GridCardItem>
                ))}
            </GridCardContainer>
        } data={data} setData={setData} />
    );
}