import {
    Box,
    Fab,
    Dialog,
    Typography,
    Divider,
    DialogTitle,
    DialogContent,
    TextField,
    IconButton,
    Tooltip,
    Button,
} from "@mui/material";
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import EditOffRoundedIcon from '@mui/icons-material/EditOffRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import PreviewRoundedIcon from '@mui/icons-material/PreviewRounded';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';

import { useState, useEffect } from "react";

import type { TableAccount, TableCreator } from "~/model/table";
import { useLocalStorage } from "~/hooks/storage";
import UserAvatar from "~/components/avatar";
import { pushMsg } from "~/components/error_popout";
import { ViewTypeSelector, type ViewType } from "~/components/view_selector";
import { ListView, CardView } from "~/components/account/view";
import AddAccountDialog from "~/components/account/add_index";
import { getAccounts, updateCreators } from "~/function/creator";
import CreatorRating from "./rating";
import ViewPostsDialog from "./view_posts";


export default function CreatorView({ creator, setCreator, onClose, onNext, onLast }: {
    creator: TableCreator;
    setCreator: (newCreator: TableCreator) => void;
    onClose: () => void;
    onNext?: () => void;
    onLast?: () => void;
}) {
    const [edit, setEdit] = useState(false);
    const [tempCreator, setTempCreator] = useState<TableCreator>(creator);
    const [viewType, setViewType] = useLocalStorage<ViewType>("account_view", "list", "local");
    const [accounts, setAccounts] = useState<TableAccount[]>([]);
    const [openPosts, setOpenPosts] = useState(false);
    const [hasOpenedPosts, setHasOpenedPosts] = useState(false);
    const [openAdd, setOpenAdd] = useState(false);

    useEffect(() => {
        getAccounts(creator.uid)
            .then((res) => setAccounts(res));
    }, []);

    useEffect(() => {
        if (openPosts)
            setHasOpenedPosts(true);
    }, [openPosts]);

    return (
        <Dialog
            open
            fullScreen
            onClose={onClose}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
                if (e.key === "ArrowUp" || e.key === "w" || e.key === "p") {
                    e.stopPropagation();
                    onLast?.();
                }
                if (e.key === "ArrowDown" || e.key === "s" || e.key === "n") {
                    e.stopPropagation();
                    onNext?.();
                }
            }}
        >
            <DialogTitle>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Box sx={{ display: "flex", gap: 3, alignItems: "center" }}>
                        <Typography variant="h5">{creator.alias}</Typography>
                        <CreatorRating
                            uid={creator.uid}
                            creator={creator}
                            onChange={(newRating) => setCreator({ ...creator, rate: newRating })}
                            sx={{ display: { xs: "none", sm: "inline-flex" } }}
                        />
                    </Box>
                    <Box sx={{ display: "flex", gap: 3, alignItems: "center" }}>
                        <Tooltip title={edit ? "Cancel" : "Edit Creator"}>
                            <IconButton onClick={() => {
                                setEdit((prev) => !prev);
                                setTempCreator(creator);
                            }}>
                                {edit ? <EditOffRoundedIcon color="error" /> : <EditRoundedIcon color="primary" />}
                            </IconButton>
                        </Tooltip>
                        {edit &&
                            <IconButton onClick={() => {
                                setEdit(false);
                                updateCreators(creator.uid, tempCreator);
                                setCreator(tempCreator);
                            }}>
                                <TaskAltRoundedIcon color="success" />
                            </IconButton>
                        }
                        {!edit &&
                            <Tooltip title="View All Posts">
                                <Fab size="small" color="primary" onClick={() => setOpenPosts(true)}>
                                    <PreviewRoundedIcon />
                                </Fab>
                            </Tooltip>
                        }
                        <Fab size="small" onClick={onClose}>
                            <CloseRoundedIcon />
                        </Fab>
                    </Box>
                </Box>
            </DialogTitle>
            <Divider />
            <DialogContent sx={{ p: 0 }}>
                {hasOpenedPosts &&
                    <ViewPostsDialog
                        open={openPosts}
                        onClose={() => setOpenPosts(false)}
                        accounts={accounts.map((a) => a.uid)}
                    />
                }
                {openAdd &&
                    <AddAccountDialog
                        creator_uid={creator.uid}
                        onSubmit={(newAccount) => {
                            if (newAccount)
                                pushMsg(`Account Task created successfully. See the Tasks page for details.`, "success");
                            setOpenAdd(false);
                        }}
                    />
                }
                <Box sx={{ display: "flex", flexDirection: { xs: "column", md: "row" }, gap: 3, p: { xs: 1, md: 3 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1.5, md: 3 } }}>
                        <UserAvatar
                            uid={tempCreator.avatar}
                            size={83}
                            onChange={edit ? (newAvatar) => setTempCreator({ ...tempCreator, avatar: newAvatar }) : undefined}
                        />
                        <TextField
                            label="Alias"
                            value={tempCreator.alias}
                            onChange={(e) => setTempCreator({ ...tempCreator, alias: e.target.value })}
                            disabled={!edit}
                        />
                    </Box>
                    <TextField
                        label="Overview"
                        value={tempCreator.overview}
                        onChange={(e) => setTempCreator({ ...tempCreator, overview: e.target.value })}
                        multiline
                        fullWidth
                        disabled={!edit}
                    />
                </Box>
                <Box sx={{
                    display: "flex",
                    width: "100%",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 3,
                    px: { xs: 1, md: 3 },
                }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, md: 3 } }}>
                        <Typography variant="h6">Accounts</Typography>
                        <ViewTypeSelector value={viewType} onChange={(newValue) => setViewType(newValue)} />
                    </Box>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AddCircleOutlineRoundedIcon />}
                        onClick={() => setOpenAdd(true)}
                    >
                        Add Account
                    </Button>
                </Box>
                <Divider />
                {viewType === "list" && <ListView accounts={accounts} />}
                {viewType === "grid" && <CardView accounts={accounts} />}
            </DialogContent>
        </Dialog>
    );
}