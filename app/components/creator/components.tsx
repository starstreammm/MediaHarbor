import {
    Fab,
    Tabs,
    Tab,
    useMediaQuery,
    Drawer,
    Box,
    TextField,
    Tooltip,
    Typography,
    Rating,
    Button,
    IconButton,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
} from "@mui/material";
import MenuOpenRoundedIcon from '@mui/icons-material/MenuOpenRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteForeverRoundedIcon from '@mui/icons-material/DeleteForeverRounded';
import BorderColorRoundedIcon from '@mui/icons-material/BorderColorRounded';

import {
    useEffect,
    useRef,
    useState,
    forwardRef,
    useImperativeHandle,
    type ForwardedRef,
    type Dispatch,
    type SetStateAction,
} from "react";

import type { ApiCreatorCreate, ApiAccountInsert, ApiAccountParse, InsertRef, ApiAccountCreate } from "~/model/api";
import ParserInsert from "~/components/account/parser";
import ManualInsert from "~/components/account/manual";
import { pushError } from "../error_popout";
import UserAvatar from "~/components/avatar";
import AddAccountDialog from "../account/add_index";

const tabType = ["parser", "manual"] as const;
type tabType = typeof tabType[number];

export function FirstTypeTab({ type, setType }: {
    type: tabType,
    setType: (value: tabType) => void;
}) {
    const isUpMd = useMediaQuery((theme) => theme.breakpoints.up('md'), { noSsr: true });
    const [open, setOpen] = useState(false);

    function Core() {
        return (
            <Tabs
                orientation="vertical"
                value={type}
                onChange={(_, newValue) => setType(newValue)}
                sx={{
                    width: { xs: "100%", md: 103 },
                    height: "100%",
                    borderRight: 1,
                    borderColor: 'divider',
                }}
            >
                <Tab label="Parser Insert" value="parser" />
                <Tab label="Manual Insert" value="manual" />
            </Tabs>
        );
    };

    if (isUpMd)
        return <Core />;
    else
        return (
            <>
                <Fab
                    color="primary"
                    onClick={() => setOpen(true)}
                    sx={{ position: 'absolute', bottom: 68, right: 8 }}
                >
                    <MenuOpenRoundedIcon />
                </Fab>
                <Drawer
                    anchor="left"
                    open={open}
                    onClose={() => setOpen(false)}
                    variant="temporary"
                    sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
                >
                    <Core />
                </Drawer>
            </>
        );
}

export const StepOne = forwardRef(StepOneCore);

function StepOneCore(
    { defaultValue = {} as ApiCreatorCreate }: { defaultValue?: ApiCreatorCreate; },
    ref: ForwardedRef<InsertRef<ApiCreatorCreate, void>>,
) {
    const [type, setType] = useState(defaultValue.accounts && !("posts" in defaultValue.accounts[0]) ? "manual" : "parser");
    const insertRef = useRef<InsertRef<ApiAccountInsert, number>>(null);
    const parseRef = useRef<InsertRef<ApiAccountParse, number>>(null);

    useEffect(() => {
        if (!tabType.includes(type as tabType))
            setType("parser");
    }, [type]);

    useImperativeHandle(ref, () => ({
        resData() {
            const data = type === "parser" ? parseRef.current?.resData() : insertRef.current?.resData();
            if (!data) {
                pushError("Please insert at least one account.");
                return defaultValue;
            }
            else {
                return {
                    alias: data.alias,
                    overview: data.overview,
                    rate: 0,
                    accounts: [data, ...defaultValue.accounts?.slice(1) || []],
                };
            }
        },
        submit() { return (async () => { })() },
    }));

    return (
        <Box sx={{ display: "flex", height: "100%" }}>
            <FirstTypeTab type={type as tabType} setType={setType} />
            <Box sx={{
                display: "flex",
                width: "100%",
                height: "100%",
                flexDirection: "column",
                overflowY: "auto",
                gap: { xs: 1.5, md: 3 },
                py: { xs: 1, md: 1.5 },
                px: { xs: 1, md: 3 },
            }}>
                <ParserInsert
                    open={type === "parser"}
                    defaultValue={
                        defaultValue.accounts && ("posts" in defaultValue.accounts[0])
                            ? defaultValue.accounts[0]
                            : undefined
                    }
                    ref={parseRef}
                />
                <ManualInsert
                    open={type === "manual"}
                    defaultValue={
                        defaultValue.accounts && !("posts" in defaultValue.accounts[0])
                            ? defaultValue.accounts[0] as ApiAccountInsert
                            : undefined
                    }
                    setType={setType}
                    ref={insertRef} />
            </Box>
        </Box>
    );
};


export function StepTwo({ insert, setInsert }: {
    insert: ApiCreatorCreate;
    setInsert: Dispatch<SetStateAction<ApiCreatorCreate>>;
}) {
    return (
        <Box sx={{
            display: "flex",
            width: "100%",
            height: "100%",
            flexDirection: "column",
            overflowY: "auto",
            gap: { xs: 1.5, md: 3 },
            py: { xs: 1, md: 1.5 },
            px: { xs: 1, md: 3 },
        }}>
            <Box sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: { xs: "space-between", md: "flex-start" },
                gap: { xs: 0, md: 8 },
            }}>
                <Tooltip title={insert.avatar === undefined ? "Click to upload an avatar, or the first account's will be used as default." : Number.isNaN(insert.avatar) ? "" : "Avator will be download after submit"} placement="top">
                    <UserAvatar uid={typeof insert.avatar === "number" ? insert.avatar : undefined} size={63} onChange={(uid) => setInsert((prev) => ({ ...prev, avatar: uid }))} />
                </Tooltip>
                <TextField
                    required
                    label="Alias"
                    value={insert.alias}
                    onChange={(e) => setInsert((prev) => ({ ...prev, alias: e.target.value }))} />
            </Box>
            <TextField
                label="Overview"
                fullWidth
                multiline
                required
                minRows={6}
                value={insert.overview}
                onChange={(e) => setInsert((prev) => ({ ...prev, overview: e.target.value }))}
            />
            <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, md: 3 } }}>
                <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
                    Rate
                </Typography>
                <Rating
                    size="large"
                    name="post-rating"
                    value={insert?.rate || 0}
                    onChange={(_, newValue) => setInsert((prev) => ({ ...prev, rate: newValue || 0 }))}
                />
            </Box>
        </Box>
    );
}

export function StepThree({ accounts, setAccounts }: {
    accounts: (ApiAccountInsert | ApiAccountCreate | ApiAccountParse)[];
    setAccounts: Dispatch<SetStateAction<ApiCreatorCreate>>;
}) {
    const [add, setAdd] = useState(false);
    const [edit, setEdit] = useState<number>();
    const editRef = useRef<InsertRef<ApiAccountInsert, number>>(null);

    function ManualInsertEdit() {
        return (
            <Dialog open fullScreen>
                <DialogTitle>Edit Manual Account</DialogTitle>
                <DialogContent>
                    <Box sx={{
                        display: "flex",
                        width: "100%",
                        height: "100%",
                        flexDirection: "column",
                        overflowY: "auto",
                        gap: { xs: 1.5, md: 3 },
                        py: { xs: 1, md: 1.5 },
                        px: { xs: 1, md: 3 },
                    }}>
                        <ManualInsert open defaultValue={accounts[edit!] as ApiAccountInsert} ref={editRef} />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Box sx={{ display: "flex", gap: 3, p: { xs: 1, md: 3 } }}>
                        <Button onClick={() => setEdit(undefined)} variant="outlined">
                            Cancel
                        </Button>
                        <Button
                            onClick={() => {
                                const res = editRef.current?.resData();
                                if (res) {
                                    const newAccounts = accounts.map((account, index) => index === edit ? res : account);
                                    setAccounts((prev) => ({ ...prev, accounts: newAccounts }));
                                    setEdit(undefined);
                                }
                            }}
                            variant="contained"
                        >
                            Apply
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>
        )
    }


    return (
        <Box sx={{
            display: "flex",
            width: "100%",
            height: "100%",
            flexDirection: "column",
            overflowY: "auto",
            gap: { xs: 1.5, md: 3 },
            py: { xs: 1, md: 1.5 },
            px: { xs: 1, md: 3 },
        }}>
            {add &&
                <AddAccountDialog
                    onRes={(res) => {
                        if (res) {
                            setAccounts((prev) => ({
                                ...prev,
                                accounts: [
                                    ...(prev.accounts || []),
                                    ...(Array.isArray(res) ? res : [res])
                                ]
                            }));
                        }
                        setAdd(false);
                    }}
                />
            }
            {edit !== undefined && <ManualInsertEdit />}
            <Table>
                <TableHead>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>No.</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>Type</TableCell>
                    <TableCell sx={{ width: "100%" }}>Details</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <Fab
                            variant="extended"
                            color="primary"
                            size="small"
                            onClick={() => setAdd(true)}
                        >
                            <AddRoundedIcon sx={{ mr: 1 }} />
                            Add
                        </Fab>
                    </TableCell>
                </TableHead>
                <TableBody>
                    {accounts.map((account, index) => (
                        <TableRow key={index}>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>{index + 1}</TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>
                                {"posts" in account
                                    ? "Parser"
                                    : "alias" in account
                                        ? "Manual"
                                        : "Url"
                                }
                            </TableCell>
                            <TableCell sx={{ width: "100%", overflowWrap: "anywhere" }}>
                                {"alias" in account
                                    ? `Alias: ${account.alias}`
                                    : `Url: ${account.url}`
                                }
                            </TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>
                                <Tooltip title="Remove">
                                    <IconButton onClick={() => setAccounts((prev) => {
                                        const newAccounts = prev.accounts?.filter((_, i) => i !== index) || []
                                        return { ...prev, accounts: newAccounts };
                                    })}>
                                        <DeleteForeverRoundedIcon color="error" />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title={("posts" in account) || !("alias" in account) ? "Only available for manual accounts" : "Edit"}>
                                    <IconButton
                                        onClick={() => setEdit(index)}
                                        disabled={("posts" in account) || !("alias" in account)}
                                    >
                                        <BorderColorRoundedIcon />
                                    </IconButton>
                                </Tooltip>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table >
        </Box >
    );
}