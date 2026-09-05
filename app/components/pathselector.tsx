import {
    Autocomplete,
    TextField,
    Typography,
    IconButton,
    Button,
    Box,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from "@mui/material";
import CreateNewFolderRoundedIcon from '@mui/icons-material/CreateNewFolderRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';

import { useEffect, useMemo, useState } from "react";

import { api } from "~/hooks/api";
import { pushError } from "~/components/error_popout";


export default function PathSelector({
    label,
    onClose,
    onEnter = () => { },
    value,
    addDir
}: {
    label: string;
    onClose: (path: string) => void;
    onEnter?: (path: string) => void;
    value?: string | null;
    addDir?: boolean
}) {
    const [path, setPath] = useState("/");
    const [pathList, setPathList] = useState<string[]>([]);
    const [newFolder, setNewFolder] = useState<string | null>(null);


    const backPath = (path: string) => {
        if (path === "/") return "/";
        if (path.endsWith("/")) path = path.slice(0, -1);
        return path.split('/').slice(0, -1).join('/') + "/" || "/";
    };

    const standardizePath = async (path: string) => {
        if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
        if (path.startsWith("'") && path.endsWith("'")) path = path.slice(1, -1);
        if (path === "") return "/";
        path = path.replaceAll("//", "/");
        if (!path.startsWith("/")) path = "/" + path;
        if (!path.endsWith("/")) {
            return path + "/";
        }
        else {
            return path;
        }
    };

    const fetch = (path: string) => {
        api.get("/api/system/lsdir", { searchParams: { path } }).json<string[]>()
            .then((res) => setPathList(res))
            .catch((e) => pushError(e, `Fetch file list ${path}`));
    }

    const makeDir = () => {
        api.get(`/api/system/mkdir?path=${path}${newFolder}`)
            .then(() => {
                setPath(prev => prev + newFolder + "/");
                setNewFolder(null);
            })
            .catch(error => {
                pushError(error, "Create new folder");
            })
    };

    const close_check = async (is_enter: boolean) => {
        is_enter ? onEnter(path) : onClose(path);
    }

    const fetch_options = useMemo(() => {
        const prepath = path.slice(0, path.lastIndexOf("/") + 1);
        const prefix = path.slice(path.lastIndexOf("/") + 1);

        return pathList
            .filter((dir) => dir.startsWith(prefix))
            .map((dir) => prepath + dir + "/")
    }, [path, pathList]);

    useEffect(() => {
        if (value === path) return;
        else { Promise.resolve(standardizePath(value ?? "/")).then(setPath); }
    }, [, value]);

    return (
        <>
            <Dialog
                fullWidth
                open={newFolder !== null}
                onClose={() => setNewFolder(null)}
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        e.stopPropagation();
                        setNewFolder(null);
                    }
                    if (e.key === "Enter") {
                        e.stopPropagation();
                        onClose(path + newFolder + "/");
                        makeDir();
                    }
                }}
            >
                <DialogTitle>
                    <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                        Create New Folder
                    </Typography>
                </DialogTitle>
                <DialogContent>
                    <TextField
                        label="Folder Name"
                        variant="outlined"
                        value={newFolder}
                        sx={{ mt: 1, width: "100%" }}
                        onChange={(e) => setNewFolder(e.target.value.replaceAll("/", "").replaceAll("&", "_"))}
                    />
                </DialogContent>
                <DialogActions sx={{ pb: 3, pr: 3, gap: 1 }}>
                    <Button onClick={() => setNewFolder(null)} variant="outlined">
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => {
                            onClose(path + newFolder + "/");
                            makeDir();
                        }}
                        disabled={newFolder === null || newFolder === ""}
                    >
                        Create
                    </Button>
                </DialogActions>
            </Dialog>
            <Box sx={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                gap: 1,
            }}>
                <IconButton
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                        setPath(backPath(path));
                        fetch(backPath(path));
                        onClose(backPath(path));
                    }}
                >
                    <ArrowBackRoundedIcon color="primary" />
                </IconButton>
                <Autocomplete
                    disableCloseOnSelect
                    disablePortal
                    value={path}
                    onOpen={() => fetch(path)}
                    onClose={() => close_check(false)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            close_check(true);
                        }
                    }}
                    options={fetch_options}
                    sx={{ width: "100%" }}
                    onInputChange={async (_, value, reason) => {
                        if (reason === "selectOption") {
                            setPath(value);
                            fetch(value);
                        }
                        else {

                            if (value.startsWith(path.slice(0, path.lastIndexOf("/") + 1))) {
                                setPath(value);
                                fetch(value.slice(0, value.lastIndexOf("/") + 1));
                            }
                            else {
                                const newPath = await standardizePath(value);
                                setPath(newPath);
                                fetch(newPath);
                            }
                        }
                    }}
                    renderInput={(params) => <TextField
                        {...params}
                        multiline
                        label={label}
                        variant="outlined"
                    />}
                />
                {addDir &&
                    <IconButton onClick={() => setNewFolder("")}>
                        <CreateNewFolderRoundedIcon color="primary" />
                    </IconButton>
                }
            </Box>
        </>
    );
}