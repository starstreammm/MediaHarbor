import {
    TableContainer,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Box,
    Button,
    CardHeader,
    CardContent,
    IconButton,
    Typography,
    Divider,
    Popover,
    Paper,
    MenuList,
    MenuItem,
    TextField,
} from "@mui/material";
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';

import { useState, type Dispatch, type SetStateAction } from "react";

import type { TableCollection } from "~/model/table";
import { GridCardContainer, GridCardItem } from "~/hooks/card_view";
import { CollectionPostsView } from "~/components/collection/view_index";
import DeleteConfirmDialog from "~/components/delete_confirm";
import { deleteCollection, updateCollections } from "~/function/collection";



function UpdateDialog({ data, setData, onClose }: {
    data: TableCollection;
    setData: Dispatch<SetStateAction<TableCollection[]>>;
    onClose: () => void;
}) {
    const [tmpAlias, setTmpAlias] = useState(data.alias);
    const [tmpNotes, setTmpNotes] = useState(data.notes);


    return (
        <Dialog open onClose={onClose}>
            <DialogTitle>Create New Collection</DialogTitle>
            <DialogContent>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 1 }}>
                    <TextField
                        required
                        label="Alias"
                        value={tmpAlias}
                        error={tmpAlias.trim() === ""}
                        onChange={(e) => setTmpAlias(e.target.value)}
                        sx={{ width: { xs: "100%", md: 388 } }}
                    />
                    <TextField
                        label="Notes"
                        multiline
                        minRows={3}
                        value={tmpNotes}
                        onChange={(e) => setTmpNotes(e.target.value)}
                        sx={{ width: { xs: "100%", md: 388 } }}
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%", gap: 1 }}>
                    <Button onClick={onClose} variant="outlined">
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() =>
                            updateCollections({ uid: data.uid, alias: tmpAlias, notes: tmpNotes })
                                .then(() => {
                                    setData((prev) =>
                                        prev.map((p) => p.uid === data.uid
                                            ? { ...p, alias: tmpAlias, notes: tmpNotes }
                                            : p
                                        )
                                    );
                                    onClose();
                                })
                        }
                    >
                        Save
                    </Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}


function ActionList({ data, setData, anchorEl, onClose }: {
    data: TableCollection | null;
    setData: Dispatch<SetStateAction<TableCollection[]>>;
    anchorEl: HTMLElement | null;
    onClose: () => void;
}) {
    const [openEdit, setOpenEdit] = useState<TableCollection | null>(null);
    const [openDelete, setOpenDelete] = useState<[number, string] | null>(null);

    return (
        <>
            {openDelete !== null &&
                <DeleteConfirmDialog
                    onClose={(needDelete) => {
                        if (needDelete)
                            deleteCollection(openDelete[0])
                                .then(() => setData((prev) => prev.filter((p) => p.uid !== openDelete[0])));
                        setOpenDelete(null);
                    }}
                    confirmKey={openDelete[1]}
                    remind={<>
                        Only <b>the collection</b> will be deleted, while the posts in it will remain.
                    </>}
                />
            }
            {openEdit !== null &&
                <UpdateDialog
                    data={openEdit}
                    setData={setData}
                    onClose={() => setOpenEdit(null)}
                />
            }
            {data !== null &&
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
                                ["Edit", "primary.main", () => setOpenEdit(data)],
                                ["Delete", "error.main", () => setOpenDelete([data.uid, data.alias])],
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



function ViewCore({ component, data, setData }: {
    component: (
        setOpenIndex: Dispatch<SetStateAction<number | null>>,
        setActionAnchor: Dispatch<SetStateAction<[HTMLElement, number] | null>>
    ) => React.ReactElement;
    data: TableCollection[];
    setData: Dispatch<SetStateAction<TableCollection[]>>;
}) {
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const [actionAnchor, setActionAnchor] = useState<[HTMLElement, number] | null>(null);

    return (
        <>
            {openIndex !== null &&
                <CollectionPostsView
                    uid={data[openIndex].uid}
                    title={data[openIndex].alias}
                    uids={data[openIndex].posts}
                    onClose={() => setOpenIndex(null)}
                />
            }
            <ActionList
                data={actionAnchor && data[actionAnchor[1]]}
                setData={setData}
                anchorEl={actionAnchor && actionAnchor[0]}
                onClose={() => setActionAnchor(null)}
            />
            {component(setOpenIndex, setActionAnchor)}
        </>
    );
}


export function ListView({ data, setData, onClick }: {
    data: TableCollection[];
    setData: Dispatch<SetStateAction<TableCollection[]>>;
    onClick?: (collection: TableCollection) => void;
}) {
    return (
        <ViewCore component={(setOpenIndex, setActionAnchor) =>
            <TableContainer>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>Alias</TableCell>
                            <TableCell sx={{ width: "100%", overflowWrap: "anywhere" }}>Notes</TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }} align="center">Posts Count</TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>Create Time</TableCell>
                            <TableCell />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.map((collection, index) => (
                            <TableRow
                                key={collection.uid}
                                onClick={() => {
                                    if (onClick)
                                        onClick(collection);
                                    else
                                        setOpenIndex(index);
                                }}
                                sx={{ cursor: "pointer" }}>
                                <TableCell sx={{ whiteSpace: "nowrap" }}>{collection.alias}</TableCell>
                                <TableCell sx={{ width: "100%", overflowWrap: "anywhere" }}>{collection.notes?.replace(/\r?\n/g, " ")}</TableCell>
                                <TableCell align="center">{collection.posts.length}</TableCell>
                                <TableCell sx={{ whiteSpace: "nowrap" }}>{new Date(collection.create_time).toLocaleString()}</TableCell>
                                <TableCell>
                                    <IconButton onClick={(e) => {
                                        e.stopPropagation();
                                        setActionAnchor([e.currentTarget, index]);
                                    }}>
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

export function CardView({ data, setData, onClick }: {
    data: TableCollection[];
    setData: Dispatch<SetStateAction<TableCollection[]>>;
    onClick?: (collection: TableCollection) => void;
}) {
    const [size, setSize] = useState(3);
    const [showDetail, setShowDetail] = useState(true);

    return (
        <ViewCore component={(setOpenIndex, setActionAnchor) =>
            <GridCardContainer setSize={setSize} setShowDetail={setShowDetail}>
                {data.map((collection, index) => (
                    <GridCardItem
                        key={collection.uid}
                        size={size}
                        onClick={() => {
                            if (onClick)
                                onClick(collection);
                            else
                                setOpenIndex(index);
                        }}
                    >
                        <CardHeader
                            action={
                                <IconButton onClick={(e) => {
                                    e.stopPropagation();
                                    setActionAnchor([e.currentTarget, index]);
                                }}>
                                    <MoreVertRoundedIcon />
                                </IconButton>
                            }
                            title={`${collection.alias} (${collection.posts.length})`}
                            subheader={new Date(collection.create_time).toLocaleString()}
                        />
                        {showDetail &&
                            <>
                                <Divider />
                                <CardContent>
                                    <Typography variant="body1" sx={{ overflowWrap: "anywhere" }}>
                                        Notes: {collection.notes || "N/A"}
                                    </Typography>
                                </CardContent>
                            </>
                        }
                    </GridCardItem>
                ))}
            </GridCardContainer>
        } data={data} setData={setData} />
    );
}