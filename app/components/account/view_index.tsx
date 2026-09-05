import {
    Box,
    Fab,
    Dialog,
    Typography,
    Divider,
    DialogTitle,
    DialogContent,
    TextField,
    ListItemButton,
    ListItemText,
    ListItemIcon,
    Collapse,
} from "@mui/material";
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';

import { useLayoutEffect, useRef, useState } from "react";

import type { TableAccount, TablePost } from "~/model/table";
import PageCore from "~/hooks/page_core";
import { getTotalPages, cursorSelect } from "~/hooks/cursor";
import { ListView, CardView } from "~/pages/posts/views";
import UserAvatar from "../avatar";
import { getPostsLs } from "../../function/account";

function DetailTextField({ label, value, width }: { label: string; value: string | number; width?: string | number }) {
    return (
        <TextField
            label={label}
            value={value}
            sx={{ width }}
            slotProps={{
                input: {
                    readOnly: true
                }
            }}
        />
    );
}

export default function AccountDetailView({ account, onClose, onNext, onLast }: {
    account: TableAccount;
    onClose: () => void;
    onNext?: () => void;
    onLast?: () => void;
}) {
    const profileRef = useRef<HTMLDivElement>(null);
    const [coverHeight, setCoverHeight] = useState(0);
    const [showProfile, setShowProfile] = useState(false);

    useLayoutEffect(() => {
        if (!profileRef.current) return;
        setCoverHeight(profileRef.current.getBoundingClientRect().height);
    }, [showProfile]);

    return (
        <Dialog
            open
            fullScreen
            onClose={onClose}
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
                        <Typography variant="h5">
                            {account.alias}
                        </Typography>
                        <Typography variant="subtitle1" color="textSecondary">
                            {account.platform?.toUpperCase()}
                        </Typography>
                    </Box>
                    <Fab size="small" onClick={onClose}>
                        <CloseRoundedIcon />
                    </Fab>
                </Box>
            </DialogTitle>
            <Divider />
            <DialogContent sx={{ p: 0 }}>
                <ListItemButton onClick={() => setShowProfile((prev) => !prev)}>
                    <ListItemText>Profile</ListItemText>
                    <ListItemIcon>
                        {showProfile ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                    </ListItemIcon>
                </ListItemButton>
                <Divider />
                <Collapse in={showProfile} timeout="auto" unmountOnExit sx={{ flexShrink: 0 }}>
                    <Box sx={{
                        position: "relative",
                        isolation: "isolate",

                        display: "flex",
                        flexDirection: "column",
                        width: "100%",
                        gap: 3,
                        p: { xs: 1, md: 3 },
                    }}>
                        <Box sx={{
                            display: "flex",
                            flexDirection: { xs: "column", md: "row" },
                            alignItems: "flex-start",
                            gap: 3,
                        }}>
                            <Box
                                ref={profileRef}
                                sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                }}
                            >
                                <Box sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 3,
                                }}>
                                    <UserAvatar uid={account.avatar} size={53} />
                                    <Typography variant="h6" sx={{ whiteSpace: "nowrap" }}>
                                        {account.alias}
                                    </Typography>
                                </Box>

                                {([
                                    ["Gender", account.gender === true
                                        ? "Male"
                                        : account.gender === false
                                            ? "Female"
                                            : "Unknown",
                                    ],
                                    ["Age", account.age || "Unknown"],
                                    ["IP", account.ip || "Unknown"],
                                    ["Address", account.address || "Unknown"],
                                    ["School", account.school || "Unknown"],
                                    ["Overview", ""],
                                ] as [string, string | number][]).map(([label, value]) =>
                                    <Typography key={label} variant="body1">
                                        <b>{label}</b>: {value}
                                    </Typography>
                                )}
                                <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                                    {account.overview || "N/A"}
                                </Typography>
                            </Box>

                            <Box sx={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 1,
                                maxWidth: { xs: "100%", md: "33%" },
                            }}>
                                {([
                                    ["UID", account.uid],
                                    ["Platform", account.platform?.toUpperCase() || "N/A"],
                                    ["PID", account.pid || "N/A"],
                                    ["Last Updated", account.latest_update ? new Date(account.latest_update).toLocaleString() : "Never"],
                                    ["Create Time", new Date(account.create_time).toLocaleString()],
                                ] as [string, string | number][]).map(([label, value]) =>
                                    <Typography key={label} variant="body1">
                                        <b>{label}</b>: {value}
                                    </Typography>
                                )}
                            </Box>

                            <Box
                                component="img"
                                src={`/api/file/${account.cover}`}
                                alt={`UID: ${account.cover}`}
                                sx={{
                                    ml: { xs: 0, md: "auto" },
                                    height: coverHeight,
                                    objectFit: "contain",
                                }}
                            />
                        </Box>
                    </Box>
                </Collapse>
                <Divider />
                <PageCore<TablePost>
                    layer="posts"
                    getTotalPages={(filter) => getTotalPages("posts", filter, [account.uid])}
                    getData={(cursor, filter) => getPostsLs(account.uid, cursor, filter)}
                    getPageChange={(newPage, oldPage, nextCursor, nowProps, filter) =>
                        cursorSelect(newPage, oldPage, nextCursor, nowProps)
                            .then((cursor) => {
                                if (!cursor)
                                    return null;
                                else
                                    return getPostsLs(account.uid, cursor, filter)
                            })
                    }
                    ListView={ListView}
                    CardView={CardView}
                />
            </DialogContent>
        </Dialog >
    );
}