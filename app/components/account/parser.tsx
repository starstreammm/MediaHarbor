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
    Alert,
} from "@mui/material";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";

import {
    useState,
    useRef,
    useEffect,
    forwardRef,
    useImperativeHandle,
    type ForwardedRef,
    type Dispatch,
    type SetStateAction,
} from "react";

import type { ApiAccountParse, InsertRef, UrlCheckState } from "~/model/api";
import type { DetailsAccount, DetailsPost, UrlsFile } from "~/model/table";
import type { AccountFilter } from "~/model/cursor";
import { urlRegex } from "~/model/const";
import { pushError, pushMsg } from "~/components/error_popout";
import {
    checkUrl,
    getProfile,
    getPostsFromUrl,
    parseSubmit,
} from "../../function/account";
import { AccountFilterPanel } from "./filter";
import UrlCheckStatus from "../url_check_status";

type LoadingState = [boolean | null, boolean | null];

export default forwardRef(ParserInsert);

function ParserInsert(
    {
        open,
        onReady,
        defaultValue = { creator_uid: -1 } as ApiAccountParse,
    }: {
        open: boolean;
        onReady?: (ready: boolean) => void;
        defaultValue?: ApiAccountParse;
    },
    ref: ForwardedRef<InsertRef<ApiAccountParse, number>>,
) {
    const restored = "posts" in defaultValue;
    const [url, setUrl] = useState(defaultValue.url ?? "");
    const [loading, setLoading] = useState<LoadingState>(
        restored ? [false, false] : [null, null],
    );
    const [parse, setParse] = useState<ApiAccountParse>(defaultValue);
    const [posts, setPosts] = useState<[DetailsPost, boolean][]>(() =>
        (defaultValue.posts ?? []).map((post) => [post, true]),
    );
    const requests = useRef([0, 0]);
    const controller = useRef<AbortController | null>(null);
    const [check, setCheck] = useState<UrlCheckState | null>(null);
    const [checkedUrl, setCheckedUrl] = useState("");
    const restoreOnce = useRef(restored);
    const ready = Boolean(
        open &&
        url &&
        checkedUrl === url &&
        check?.status === "passed" &&
        loading[0] === false &&
        loading[1] === false &&
        parse.pid &&
        parse.platform,
    );

    useEffect(() => {
        onReady?.(ready);
    }, [onReady, ready]);

    function resData(): ApiAccountParse {
        if (!ready) {
            pushError(
                "Wait for both the profile and posts to load successfully.",
            );
            throw new Error("Account is not ready");
        }
        return {
            ...parse,
            url,
            posts: posts.filter(([, include]) => include).map(([post]) => post),
            posts_scanned_at: posts.every(([, include]) => include)
                ? parse.posts_scanned_at
                : null,
        };
    }

    useImperativeHandle(ref, () => ({
        resData,
        submit() {
            return parseSubmit(resData());
        },
    }));

    const fetchData = (profile: boolean, loadPosts: boolean) => {
        const signal = controller.current?.signal;
        if (!signal || signal.aborted) return;
        if (profile) {
            const request = ++requests.current[0];
            setLoading((previous) => [true, previous[1]]);
            getProfile(url, signal)
                .then((result) => {
                    if (request !== requests.current[0]) return;
                    setParse((previous) => ({ ...previous, ...result, url }));
                    setLoading((previous) => [false, previous[1]]);
                })
                .catch(() => {
                    if (request === requests.current[0])
                        setLoading((previous) => [null, previous[1]]);
                });
        }
        if (loadPosts) {
            const request = ++requests.current[1];
            const started = new Date().toISOString();
            setPosts([]);
            setParse((previous) => ({ ...previous, posts_scanned_at: null }));
            setLoading((previous) => [previous[0], true]);
            (async () => {
                for await (const batch of getPostsFromUrl(url, signal)) {
                    if (request !== requests.current[1]) return;
                    setPosts((previous) => [
                        ...previous,
                        ...batch.map(
                            (post) => [post, true] as [DetailsPost, boolean],
                        ),
                    ]);
                }
            })()
                .then(() => {
                    if (request !== requests.current[1]) return;
                    setLoading((previous) => [previous[0], false]);
                    setParse((previous) => ({
                        ...previous,
                        sync: true,
                        posts_scanned_at: started,
                    }));
                })
                .catch(() => {
                    if (request === requests.current[1])
                        setLoading((previous) => [previous[0], null]);
                });
        }
    };

    useEffect(() => {
        const abortController = new AbortController();
        controller.current = abortController;
        const restore = restoreOnce.current;
        restoreOnce.current = false;
        setCheckedUrl("");
        setCheck(url && open ? { status: "checking" } : null);
        if (!restore) {
            setLoading([null, null]);
            setPosts([]);
            setParse({
                creator_uid: defaultValue.creator_uid,
            } as ApiAccountParse);
        }
        if (open && url) {
            checkUrl(url, abortController.signal).then((result) => {
                if (abortController.signal.aborted) return;
                setCheck(result);
                setCheckedUrl(url);
                if (result.status === "passed" && !restore) fetchData(true, true);
            });
        }
        return () => {
            abortController.abort();
            requests.current[0] += 1;
            requests.current[1] += 1;
        };
    }, [url, open]);

    if (!open) return null;

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
                            pushMsg(
                                "Multiple valid URLs found. Only the first one will be used.",
                                "warning",
                            );
                        }
                    } else {
                        pushMsg("No valid URL found.", "warning");
                    }
                }}
            />
        );
    else
        return (
            <>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: 3,
                    }}
                >
                    <TextField
                        fullWidth
                        label="Account URL"
                        value={url}
                        disabled
                    />
                    {check && <UrlCheckStatus result={check} />}
                    <IconButton aria-label="Edit account URL" onClick={() => setUrl("")}>
                        <EditRoundedIcon />
                    </IconButton>
                </Box>
                {check && check.status !== "checking" && check.status !== "passed" && (
                    <Alert severity={check.status === "exists" ? "warning" : "error"}>
                        {check.message}
                    </Alert>
                )}
                {checkedUrl === url && check?.status === "passed" && <>
                    <Divider />
                    <SyncPanel
                        able={posts.every(([_, include]) => include)}
                        sync={parse.sync}
                        setSync={(sync) => setParse((prev) => ({ ...prev, sync }))}
                        filter={parse.filter ?? {}}
                        setFilter={(filter) =>
                            setParse((prev) => ({ ...prev, filter }))
                        }
                    />
                    <Divider />
                    <ProfilePanel
                        state={loading[0]}
                        data={parse}
                        onRetry={() => fetchData(true, false)}
                    />
                    <Divider />
                    <PostsPanel
                        state={loading[1]}
                        data={posts}
                        setData={setPosts}
                        setSync={(sync) => setParse((prev) => ({ ...prev, sync }))}
                        onRetry={() => {
                            setPosts([]);
                            fetchData(false, true);
                        }}
                    />
                </>}
            </>
        );
}

function ProfilePanel({
    state,
    data,
    onRetry,
}: {
    state: boolean | null;
    data: DetailsAccount<UrlsFile>;
    onRetry: () => void;
}) {
    const theme = useTheme();
    const [open, setOpen] = useState(false);

    function LoadingComponent() {
        return (
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: { xs: 1.5, md: 3 },
                }}
            >
                <Box sx={{ display: "flex", gap: 1 }}>
                    <Skeleton
                        variant="rectangular"
                        width="83%"
                        height={`calc(${theme.typography.body1.fontSize} * 3)`}
                    />
                    <Skeleton
                        variant="rectangular"
                        width="17%"
                        height={`calc(${theme.typography.body1.fontSize} * 3)`}
                    />
                </Box>
                {(
                    [
                        ["100%"],
                        ["100%"],
                        ["50%", "50%"],
                        ["17%", "83%"],
                        ["100%"],
                    ] as string[][]
                ).map((line, index) => (
                    <Box
                        key={index}
                        sx={{ display: "flex", flexDirection: "row", gap: 1 }}
                    >
                        {line.map((w) => (
                            <Skeleton
                                key={w}
                                variant="rectangular"
                                width={w}
                                height={`calc(${theme.typography.body1.fontSize} * 3)`}
                            />
                        ))}
                    </Box>
                ))}
            </Box>
        );
    }

    if (state === null)
        return (
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: { xs: 1.5, md: 3 },
                }}
            >
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
                        {open ? (
                            <ExpandLessRoundedIcon />
                        ) : (
                            <ExpandMoreRoundedIcon />
                        )}
                    </ListItemIcon>
                </ListItemButton>
                <Collapse in={open} timeout="auto" unmountOnExit>
                    <LoadingComponent />
                </Collapse>
            </Box>
        );
    else if (state === true)
        return (
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: { xs: 1.5, md: 3 },
                }}
            >
                <ListItemButton onClick={() => setOpen(!open)}>
                    <ListItemText>
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                            }}
                        >
                            <Typography variant="h6">Profile</Typography>
                            <CircularProgress size={23} />
                        </Box>
                    </ListItemText>
                    <ListItemIcon>
                        {open ? (
                            <ExpandLessRoundedIcon />
                        ) : (
                            <ExpandMoreRoundedIcon />
                        )}
                    </ListItemIcon>
                </ListItemButton>
                <Collapse in={open} timeout="auto" unmountOnExit>
                    <LoadingComponent />
                </Collapse>
            </Box>
        );
    else
        return (
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: { xs: 1.5, md: 3 },
                }}
            >
                <ListItemButton onClick={() => setOpen(!open)}>
                    <ListItemText>
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                            }}
                        >
                            <Typography variant="h6" color="primary.dark">
                                Profile
                            </Typography>
                            <Typography variant="body1">
                                {data.alias}
                            </Typography>
                        </Box>
                    </ListItemText>
                    <ListItemIcon>
                        {open ? (
                            <ExpandLessRoundedIcon />
                        ) : (
                            <ExpandMoreRoundedIcon />
                        )}
                    </ListItemIcon>
                </ListItemButton>
                <Collapse in={open} timeout="auto" unmountOnExit>
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: { xs: 1.5, md: 3 },
                        }}
                    >
                        <Box
                            sx={{
                                display: "flex",
                                gap: { xs: 1.5, md: 3 },
                                alignItems: "center",
                            }}
                        >
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
                        {(
                            [
                                [["Alias", data.alias]],
                                [["Overview", data.overview]],
                                [
                                    ["Age", data.age],
                                    [
                                        "Gender",
                                        data.gender === false
                                            ? "Female"
                                            : data.gender === true
                                              ? "Male"
                                              : "Unknown",
                                    ],
                                ],
                                [
                                    ["IP", data.ip],
                                    ["Address", data.address],
                                ],
                                [["School", data.school]],
                            ] as [string, string][][]
                        ).map((line) => (
                            <Box
                                key={line[0][0]}
                                sx={{ display: "flex", gap: 1 }}
                            >
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

function PostsPanel({
    state,
    data,
    setData,
    setSync,
    onRetry,
}: {
    state: boolean | null;
    data: [DetailsPost, boolean][];
    setData: Dispatch<SetStateAction<[DetailsPost, boolean][]>>;
    setSync: (sync: boolean) => void;
    onRetry: () => void;
}) {
    const [open, setOpen] = useState(state === false ? true : false);

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                gap: { xs: 1.5, md: 3 },
            }}
        >
            <ListItemButton onClick={() => setOpen(!open)}>
                <ListItemText>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography
                            variant="h6"
                            color={state === null ? "error" : undefined}
                        >
                            Posts
                        </Typography>
                        <Typography
                            variant="body1"
                            color={state === null ? "error" : undefined}
                        >
                            Total:
                        </Typography>
                        {state === true ? (
                            <CircularProgress size={23} />
                        ) : (
                            <Typography
                                variant="body1"
                                color={state === null ? "error" : undefined}
                            >
                                {data.length}
                            </Typography>
                        )}
                    </Box>
                </ListItemText>
                {state !== false && (
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
                )}
                <ListItemIcon>
                    {open ? (
                        <ExpandLessRoundedIcon />
                    ) : (
                        <ExpandMoreRoundedIcon />
                    )}
                </ListItemIcon>
            </ListItemButton>
            <Collapse in={open} timeout="auto" unmountOnExit>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>
                                Select
                            </TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>
                                No.
                            </TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>
                                Post Time
                            </TableCell>
                            <TableCell sx={{ width: "100%" }}>
                                Overview
                            </TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }}>
                                File Count
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.map(([post, include], index) => (
                            <TableRow key={post.post_time}>
                                <TableCell>
                                    <Checkbox
                                        checked={include}
                                        onChange={(e) => {
                                            setSync(e.target.checked);
                                            if (!e.target.checked)
                                                setSync(false);
                                            else if (
                                                data.every(
                                                    ([_, include]) => include,
                                                )
                                            )
                                                setSync(true);
                                            const newData = [...data];
                                            newData[index][1] =
                                                e.target.checked;
                                            setData(newData);
                                        }}
                                    />
                                </TableCell>
                                <TableCell sx={{ whiteSpace: "nowrap" }}>
                                    {index + 1}
                                </TableCell>
                                <TableCell sx={{ whiteSpace: "nowrap" }}>
                                    {new Date(post.post_time).toLocaleString()}
                                </TableCell>
                                <TableCell sx={{ width: "100%" }}>
                                    {post.overview}
                                </TableCell>
                                <TableCell>{post.files.length}</TableCell>
                            </TableRow>
                        ))}
                        {state !== false &&
                            Array.from({ length: 3 }).map((_, index) => (
                                <TableRow key={index}>
                                    <TableCell colSpan={4}>
                                        <Skeleton
                                            variant="rectangular"
                                            width="100%"
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </Collapse>
        </Box>
    );
}

function SyncPanel({
    able,
    sync,
    setSync,
    filter,
    setFilter,
}: {
    able: boolean;
    sync: boolean;
    setSync: (sync: boolean) => void;
    filter: AccountFilter;
    setFilter: (filter: AccountFilter) => void;
}) {
    const [open, setOpen] = useState(false);

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                gap: 1,
            }}
        >
            <ListItemButton
                onClick={() => {
                    if (!open) {
                        setOpen(true);
                        setSync(true);
                    } else setOpen(false);
                }}
                disabled={!able}
            >
                <ListItemText>
                    <Typography variant="h6">Auto Sync</Typography>
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
                    {open ? (
                        <ExpandLessRoundedIcon />
                    ) : (
                        <ExpandMoreRoundedIcon />
                    )}
                </ListItemIcon>
            </ListItemButton>
            <Collapse
                in={open && able}
                timeout="auto"
                unmountOnExit
                sx={{ pb: 3 }}
            >
                <AccountFilterPanel
                    defaultFilter={filter}
                    onChange={setFilter}
                />
            </Collapse>
        </Box>
    );
}
