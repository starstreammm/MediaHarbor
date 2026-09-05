import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    Popper,
    Paper,
    MenuList,
    MenuItem,
    Typography,
    Fab,
} from "@mui/material";
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

import {
    useState,
    forwardRef,
    useImperativeHandle,
    type ForwardedRef,
    useRef,
} from "react";

import type { InsertRef } from "~/model/api";
import { pushMsg } from "~/components/error_popout";
import { PostsPageCore } from "~/pages/posts/index";
import { createCollection, updateCollections } from "~/function/collection";
import AddPostDialog from "../post/add_index";

export const AddCollection = forwardRef(AddCollectionCore);

function AddCollectionCore({ }, ref: ForwardedRef<InsertRef<string, number>>) {
    const [alias, setAlias] = useState("");
    const [notes, setNotes] = useState("");

    useImperativeHandle(ref, () => ({
        resData() {
            if (alias)
                return alias;
            else {
                pushMsg("Please input the collection alias.", "error");
                throw new Error("Invalid data");
            }
        },
        submit() {
            if (alias) {
                return createCollection({ alias, notes });
            }
            else {
                pushMsg("Please input the collection alias.", "error");
                throw new Error("Invalid data");
            }
        },
    }));

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <TextField
                required
                label="Alias"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                sx={{ width: { xs: "100%", md: 388 } }}
            />
            <TextField
                label="Notes"
                multiline
                minRows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                sx={{ width: { xs: "100%", md: 388 } }}
            />
        </Box>
    );
}


export function AddCollectionDialog({ onClose }: { onClose: (uid: number | null) => void }) {
    const ref = useRef<InsertRef<string, number>>(null)

    return (
        <Dialog open onClose={() => onClose(null)}>
            <DialogTitle>Create New Collection</DialogTitle>
            <DialogContent>
                <AddCollection ref={ref} />
            </DialogContent>
            <DialogActions>
                <Box sx={{ display: "flex", justifyContent: "flex-end", width: "100%", gap: 1 }}>
                    <Button onClick={() => onClose(null)} variant="outlined">
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => {
                            ref.current?.submit()
                                .then((uid) => { onClose(uid ?? null); })
                        }}
                    >
                        Create
                    </Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}



function AppendExistingPost({ onClose }: { onClose: (uids: number[] | null) => void }) {
    return (
        <Dialog open onClose={() => onClose(null)}>
            <DialogTitle><Box sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
            }}>
                <Typography variant="h5">
                    Choose a Post to Append
                </Typography>
                <Fab size="small" onClick={() => onClose(null)}>
                    <CloseRoundedIcon />
                </Fab>
            </Box></DialogTitle>
            <DialogContent>
                <PostsPageCore onClick={(post) => {
                    onClose([post.uid]);
                }} />
            </DialogContent>
        </Dialog>
    );
}


export function AppendPostComponent({ uid, onChange }: {
    uid: number;
    onChange?: () => void;
}) {
    const [open, setOpen] = useState(0);
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    return (
        <>
            {open === 1 &&
                <AppendExistingPost
                    onClose={(uids) => {
                        if (uids) {
                            updateCollections({ uid, add: uids })
                                .then(() => {
                                    onChange?.();
                                    pushMsg(`${uids.length} Post${uids.length > 1 ? "s" : ""} added to collection.`, "success");
                                });
                        }
                        setOpen(0);
                    }} />
            }
            {open === 2 &&
                <AddPostDialog
                    onClose={() => setOpen(0)}
                    resData={(data) => {
                        updateCollections({ uid, add: Array.isArray(data) ? data : [data] })
                            .then(() => onChange?.());
                        pushMsg(`${Array.isArray(data) ? data.length : 1} Post${Array.isArray(data) ? "s" : ""} added to collection.`, "success");
                    }}
                />
            }
            <Box onMouseLeave={() => setAnchorEl(null)} sx={{ display: "inline-flex" }}>
                <Button
                    size="small"
                    variant="contained"
                    onMouseEnter={(e) => setAnchorEl(e.currentTarget)}
                    startIcon={<AddCircleOutlineRoundedIcon />}
                >
                    Post(s)
                </Button>

                <Popper
                    open={Boolean(anchorEl)}
                    anchorEl={anchorEl}
                    placement="bottom-start"
                    sx={{ pt: 1, zIndex: 1300 }}
                >
                    <Paper elevation={13}>
                        <MenuList>
                            {[
                                "Append Existing Post(s)",
                                "Create New Post(s) and Append",
                            ].map((label, index) =>
                                <MenuItem
                                    onClick={() => {
                                        setOpen(index + 1);
                                        setAnchorEl(null);
                                    }}
                                >
                                    {label}
                                </MenuItem>
                            )}
                        </MenuList>
                    </Paper>
                </Popper>
            </Box>
        </>
    );
}