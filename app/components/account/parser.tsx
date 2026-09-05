import {
    TextField,
    Typography,
    Box,
    IconButton,
    Button,
    Skeleton,
    useTheme,
    Collapse,
    Checkbox,
    ListItemButton,
    ListItemText,
    ListItemIcon,
    Table,
    TableCell,
    TableRow,
    TableHead,
    TableBody,
    Switch,
    CircularProgress,
    Divider,
} from "@mui/material";
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';

import {
    useState,
    useEffect,
    forwardRef,
    useImperativeHandle,
    type ForwardedRef,
    type Dispatch,
    type SetStateAction,
} from "react";

import type { ApiAccountParse, InsertRef } from "~/model/api";
import type { DetailsAccount, DetailsPost } from "~/model/table";
import type { AccountFilter } from "~/model/cursor";
import { urlRegex } from "~/model/const";
import { pushError, pushMsg } from "~/components/error_popout";
import { getProfile, getPostsFromUrl, parseSubmit } from "../../function/account";
import { AccountFilterPanel } from "./filter";

type LoadingState = [boolean | null, boolean | null];

export default forwardRef(ParserInsert);

function ParserInsert(
    {
        open,
        defaultValue = { creator_uid: -1 } as ApiAccountParse,
    }: {
        open: boolean;
        defaultValue?: ApiAccountParse;
    },
    ref: ForwardedRef<InsertRef<ApiAccountParse, number>>,
) {
    if (!open) return null;

    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState<LoadingState>([false, false]);
    const [parse, setParse] = useState<ApiAccountParse>(defaultValue);
    const [posts, setPosts] = useState<[DetailsPost, boolean][]>([]);

    useImperativeHandle(ref, () => ({
        resData() {
            if (url
                && loading[0] === false && loading[1] === false
                && posts.length > 0
                && parse.pid && parse.platform
            ) {
                return {
                    ...parse,
                    posts: posts
                        .filter(([_, include]) => include)
                        .map(([post, _]) => post),
                };
            }
            else {
                pushError("Please insert a valid account URL and wait for the data to load.");
                throw new Error("Invalid data");
            }
        },
        submit() {
            if (url && loading[0] && loading[1] && posts.length > 0 && parse.pid && parse.platform) {
                const data = {
                    ...parse,
                    posts: posts
                        .filter(([_, include]) => include)
                        .map(([post, _]) => post),
                };
                return parseSubmit(data);
            }
            else {
                pushError("Please insert a valid account URL and wait for the data to load.");
                throw new Error("Invalid data");
            }
        },
    }));

    const fetchData = (sta: LoadingState) => {
        if (!urlRegex.test(url)) return;
        setLoading(sta);
        setPosts([]);
        if (sta[0]) {
            getProfile(url)
                .then((res) => {
                    setParse((prev) => ({ ...prev, ...res }));
                    setLoading((prev) => [false, prev[1]]);
                })
                .catch(() => setLoading((prev) => [null, prev[1]]));
        }
        if (sta[1]) {
            (async () => {
                for await (const posts of getPostsFromUrl(url)) {
                    setPosts(prev => [
                        ...prev,
                        ...posts.map(post => [post, true] as [DetailsPost, boolean]),
                    ]);
                }
            })()
                .then(() => {
                    setLoading((prev) => [prev[0], false]);
                    setParse((prev) => ({ ...prev, sync: true }));
                })
                .catch(() => setLoading((prev) => [prev[0], null]));
        }
    }

    useEffect(() => fetchData([true, true]), [url]);
    useEffect(() => {
        if ("posts" in defaultValue) {
            setPosts(defaultValue.posts.map(post => [post, true] as [DetailsPost, boolean]));
        }
        if ("url" in defaultValue) {
            setUrl(defaultValue.url ?? "");
        }
    }, []);

    if (!url)
        return (
            <TextField
                fullWidth
                label="Account URL"
                value={url}
                onChange={(e) => {
                    const matches = e.target.value.match(urlRegex);
                    if (matches) {
                        setUrl(matches[0]);
                        if (matches.length > 1) {
                            pushMsg("Multiple valid URLs found. Only the first one will be used.", "warning");
                        }
                    }
                    else {
                        pushMsg("No valid URL found.", "warning");
                    }
                }}
            />
        );

    else
        return (
            <>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <TextField
                        fullWidth
                        label="Account URL"
                        value={url}
                        disabled
                    />
                    <IconButton onClick={() => setUrl("")}>
                        <EditRoundedIcon />
                    </IconButton>
                </Box >
                <Divider />
                <SyncPanel
                    able={posts.every(([_, include]) => include)}
                    sync={parse.sync}
                    setSync={(sync) => setParse((prev) => ({ ...prev, sync }))}
                    filter={parse.filter ?? {}}
                    setFilter={(filter) => setParse((prev) => ({ ...prev, filter }))}
                />
                <Divider />
                <ProfilePanel state={loading[0]} data={parse} onRetry={() => fetchData([true, loading[1]])} />
                <Divider />
                <PostsPanel
                    state={loading[1]}
                    data={posts}
                    setData={setPosts}
                    setSync={(sync) => setParse((prev) => ({ ...prev, sync }))}
                    onRetry={() => {
                        setPosts([]);
                        fetchData([loading[0], true]);
                    }}
                />
            </>
        );
}


function ProfilePanel({ state, data, onRetry }: {
    state: boolean | null;
    data: DetailsAccount;
    onRetry: () => void;
}) {
    const theme = useTheme();
    const [open, setOpen] = useState(false);

    function LoadingComponent() {
        return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: { xs: 1.5, md: 3 } }}>
                <Box sx={{ display: "flex", gap: 1 }}>
                    <Skeleton variant="rectangular" width="83%" height={`calc(${theme.typography.body1.fontSize} * 3)`} />
                    <Skeleton variant="rectangular" width="17%" height={`calc(${theme.typography.body1.fontSize} * 3)`} />
                </Box>
                {([
                    ["100%"],
                    ["100%"],
                    ["50%", "50%"],
                    ["17%", "83%"],
                    ["100%"],
                ] as string[][]).map((line, index) =>
                    <Box key={index} sx={{ display: "flex", flexDirection: "row", gap: 1 }}>
                        {line.map((w) =>
                            <Skeleton key={w} variant="rectangular" width={w} height={`calc(${theme.typography.body1.fontSize} * 3)`} />
                        )}
                    </Box>
                )}
            </Box>
        );
    }

    if (state === null)
        return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: { xs: 1.5, md: 3 } }}>
                <ListItemButton onClick={() => setOpen(!open)}>
                    <ListItemText>
                        <Typography variant="h6" color="error">
                            Profile
                        </Typography>
                    </ListItemText>
                    <ListItemIcon sx={{ mr: 3 }}>
                        <Button
                            variant="contained"
                            color="error"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRetry();
                            }}
                            startIcon={<ReplayRoundedIcon />}
                        >
                            Retry
                        </Button>
                    </ListItemIcon>
                    <ListItemIcon>
                        {open ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                    </ListItemIcon>
                </ListItemButton>
                <Collapse in={open} timeout="auto" unmountOnExit>
                    <LoadingComponent />
                </Collapse>
            </Box>
        );

    else if (state === true)
        return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: { xs: 1.5, md: 3 } }}>
                <ListItemButton onClick={() => setOpen(!open)}>
                    <ListItemText>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Typography variant="h6">
                                Profile
                            </Typography>
                            <CircularProgress size={23} />
                        </Box>
                    </ListItemText>
                    <ListItemIcon>
                        {open ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                    </ListItemIcon>
                </ListItemButton>
                <Collapse in={open} timeout="auto" unmountOnExit>
                    <LoadingComponent />
                </Collapse>
            </Box>
        );

    else
        return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: { xs: 1.5, md: 3 } }} >
                <ListItemButton onClick={() => setOpen(!open)}>
                    <ListItemText>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Typography variant="h6" color="primary.dark">
                                Profile
                            </Typography>
                            <Typography variant="body1">
                                {data.alias}
                            </Typography>
                        </Box>
                    </ListItemText>
                    <ListItemIcon>
                        {open ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                    </ListItemIcon>
                </ListItemButton>
                <Collapse in={open} timeout="auto" unmountOnExit>
                    <Box sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: { xs: 1.5, md: 3 },
                    }} >
                        <Box sx={{
                            display: "flex",
                            gap: { xs: 1.5, md: 3 },
                            alignItems: "center",
                        }}>
                            <TextField
                                fullWidth
                                label="PID"
                                value={data.pid}
                                slotProps={{
                                    input: {
                                        readOnly: true,
                                    },
                                }}
                            />
                            <Typography variant="body1" color="success">
                                {data.platform?.toUpperCase()}
                            </Typography>
                        </Box>
                        {([
                            [["Alias", data.alias]],
                            [["Overview", data.overview]],
                            [["Age", data.age],
                            ["Gender", data.gender === false ? "Female" : data.gender === true ? "Male" : "Unknown"]],
                            [["IP", data.ip], ["Address", data.address]],
                            [["School", data.school]],
                        ] as [string, string][][]).map((line) => (
                            <Box key={line[0][0]} sx={{ display: "flex", gap: 1 }}>
                                {line.map(([label, value]) => (
                                    <TextField
                                        key={label}
                                        fullWidth
                                        label={label}
                                        value={value}
                                        slotProps={{
                                            input: {
                                                readOnly: true,
                                            },
                                        }}
                                    />
                                ))}
                            </Box>
                        ))}
                    </Box>
                </Collapse>
            </Box>
        );
}

function PostsPanel({ state, data, setData, setSync, onRetry }: {
    state: boolean | null;
    data: [DetailsPost, boolean][];
    setData: Dispatch<SetStateAction<[DetailsPost, boolean][]>>;
    setSync: (sync: boolean) => void;
    onRetry: () => void;
}) {
    const [open, setOpen] = useState(state === false ? true : false);

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: { xs: 1.5, md: 3 } }} >
            <ListItemButton onClick={() => setOpen(!open)}>
                <ListItemText>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="h6" color={state === null ? "error" : undefined}>
                            Posts
                        </Typography>
                        <Typography variant="body1" color={state === null ? "error" : undefined}>
                            Total:
                        </Typography>
                        {state === true
                            ? <CircularProgress size={23} />
                            : <Typography variant="body1" color={state === null ? "error" : undefined}>
                                {data.length}
                            </Typography>
                        }
                    </Box>
                </ListItemText>
                {state !== false &&
                    <ListItemIcon sx={{ mr: 3 }}>
                        <Button
                            variant="contained"
                            color="error"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRetry();
                            }}
                            startIcon={<ReplayRoundedIcon />}
                        >
                            Retry
                        </Button>
                    </ListItemIcon>
                }
                <ListItemIcon>
                    {open ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                </ListItemIcon>
            </ListItemButton>
            <Collapse in={open} timeout="auto" unmountOnExit>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>Select</TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>No.</TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>Post Time</TableCell>
                            <TableCell sx={{ width: "100%" }}>Overview</TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>File Count</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.map(([post, include], index) =>
                            <TableRow key={post.post_time}>
                                <TableCell>
                                    <Checkbox
                                        checked={include}
                                        onChange={(e) => {
                                            setSync(e.target.checked);
                                            if (!e.target.checked) setSync(false);
                                            else if (data.every(([_, include]) => include)) setSync(true);
                                            const newData = [...data];
                                            newData[index][1] = e.target.checked;
                                            setData(newData);
                                        }}
                                    />
                                </TableCell>
                                <TableCell sx={{ whiteSpace: "nowrap" }}>{index + 1}</TableCell>
                                <TableCell sx={{ whiteSpace: "nowrap" }}>
                                    {new Date(post.post_time).toLocaleString()}
                                </TableCell>
                                <TableCell sx={{ width: "100%" }}>{post.overview}</TableCell>
                                <TableCell>{post.files.length}</TableCell>
                            </TableRow>
                        )}
                        {state !== false && Array.from({ length: 3 }).map((_, index) =>
                            <TableRow key={index}>
                                <TableCell colSpan={4}>
                                    <Skeleton variant="rectangular" width="100%" />
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Collapse>
        </Box>
    );
}

function SyncPanel({ able, sync, setSync, filter, setFilter }: {
    able: boolean;
    sync: boolean;
    setSync: (sync: boolean) => void;
    filter: AccountFilter;
    setFilter: (filter: AccountFilter) => void;
}) {
    const [open, setOpen] = useState(false);

    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: { xs: 1.5, md: 3 } }} >
            <ListItemButton
                onClick={() => {
                    if (!open) {
                        setOpen(true);
                        setSync(true);
                    }
                    else setOpen(false);
                }}
                disabled={!able}
            >
                <ListItemText>
                    <Typography variant="h6">
                        Auto Sync
                    </Typography>
                </ListItemText>
                <ListItemIcon>
                    <Switch
                        checked={sync}
                        onChange={(e) => setSync(e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={!able}
                    />
                </ListItemIcon>
                <ListItemIcon>
                    {open ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                </ListItemIcon>
            </ListItemButton>
            <Collapse in={open && able} timeout="auto" unmountOnExit>
                <AccountFilterPanel defaultFilter={filter} onChange={setFilter} />
            </Collapse>
        </Box>
    );
}