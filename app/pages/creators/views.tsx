import {
    IconButton,
    Rating,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CardHeader,
    CardContent,
    Typography,
} from "@mui/material";
import DeleteForeverRoundedIcon from '@mui/icons-material/DeleteForeverRounded';

import { useState, type Dispatch, type SetStateAction } from "react";

import type { TableCreator } from "~/model/table";
import { GridCardContainer, GridCardItem } from "~/hooks/card_view";
import UserAvatar from "~/components/avatar";
import CreatorView from "~/components/creator/view_index";
import CreatorRating from "~/components/creator/rating";
import DeleteConfirmDialog from "~/components/delete_confirm";
import { updateCreators, deleteCreators } from "../../function/creator";



export function ViewCore({ component, data, setData }: {
    component: (
        setOpenIndex: Dispatch<SetStateAction<number | null>>,
        setOpenDelete: Dispatch<SetStateAction<[number, string] | null>>,
    ) => React.ReactElement;
    data: TableCreator[];
    setData: React.Dispatch<React.SetStateAction<TableCreator[]>>;
}) {
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const [openDelete, setOpenDelete] = useState<[number, string] | null>(null);

    return (
        <>
            {openIndex !== null &&
                <CreatorView
                    creator={data[openIndex]}
                    setCreator={(newCreator) =>
                        setData((prev) => prev.map((c) => c.uid === newCreator.uid ? newCreator : c))
                    }
                    onClose={() => setOpenIndex(null)}
                />
            }
            {openDelete !== null &&
                <DeleteConfirmDialog
                    onClose={(needDelete) => {
                        if (needDelete)
                            deleteCreators(openDelete[0]);
                        setOpenDelete(null);
                    }}
                    confirmKey={openDelete[1]}
                    remind={<>
                        All related data will be deleted, including the <b>accounts</b>, <b>posts</b> and <b>files</b> that belong to the creator.
                    </>}
                />
            }
            {component(setOpenIndex, setOpenDelete)}
        </>
    );
}


export function ListView({ data, setData }: {
    data: TableCreator[];
    setData: React.Dispatch<React.SetStateAction<TableCreator[]>>;
}) {
    return (
        <ViewCore component={(setOpenIndex, setOpenDelete) =>
            <TableContainer sx={{
                scrollbarWidth: 'none',     // Firefox
                msOverflowStyle: 'none',    // IE 10+
                '&::-webkit-scrollbar': {   // Chrome / Safari
                    display: 'none',
                },
            }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Avator</TableCell>
                            <TableCell>Alias</TableCell>
                            <TableCell sx={{ width: "100%", minWidth: 188 }}>Overview</TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>Create Time</TableCell>
                            <TableCell>Rate</TableCell>
                            <TableCell />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.map((creator, index) => (
                            <TableRow key={creator.uid} onClick={() => setOpenIndex(index)} sx={{ cursor: "pointer" }}>
                                <TableCell>
                                    <UserAvatar uid={creator.avatar ?? -1} size={38} />
                                </TableCell>
                                <TableCell sx={{ whiteSpace: "nowrap" }}>{creator.alias}</TableCell>
                                <TableCell sx={{ overflowWrap: "anywhere" }}>{creator.overview}</TableCell>
                                <TableCell sx={{ whiteSpace: "nowrap" }}>{new Date(creator.create_time).toLocaleString()}</TableCell>
                                <TableCell>
                                    <Rating
                                        value={creator.rate}
                                        onChange={(_, newValue) => {
                                            if (newValue === null || newValue === 0) return;
                                            updateCreators(creator.uid, { ...creator, rate: newValue ?? 0 });
                                            setData((prev) => prev.map((c) => c.uid === creator.uid ? { ...c, rate: newValue ?? 0 } : c));
                                        }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <IconButton onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenDelete([creator.uid, creator.alias]);
                                    }}>
                                        <DeleteForeverRoundedIcon color="error" />
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
    data: TableCreator[];
    setData: React.Dispatch<React.SetStateAction<TableCreator[]>>;
}) {
    const [size, setSize] = useState(3);

    return (
        <ViewCore component={(setOpenIndex, setOpenDelete) =>
            <GridCardContainer setSize={setSize}>
                {data.map((creator, index) => (
                    <GridCardItem size={size} key={creator.uid} onClick={() => setOpenIndex(index)}>
                        <CardHeader
                            avatar={<UserAvatar uid={creator.avatar} size={43} />}
                            action={
                                <IconButton onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenDelete([creator.uid, creator.alias]);
                                }}>
                                    <DeleteForeverRoundedIcon color="error" />
                                </IconButton>
                            }
                            title={
                                <CreatorRating
                                    uid={creator.uid}
                                    creator={creator}
                                    onChange={(newRating) =>
                                        setData((prev) =>
                                            prev.map((c) => c.uid === creator.uid
                                                ? { ...c, rate: newRating }
                                                : c)
                                        )}
                                />}
                            subheader={new Date(creator.create_time).toLocaleString()}
                        />
                        <CardContent>
                            <Typography variant="body1" sx={{ overflowWrap: "anywhere" }}>
                                {creator.overview}
                            </Typography>
                        </CardContent>
                    </GridCardItem>
                ))}
            </GridCardContainer>
        } data={data} setData={setData} />
    );
}


