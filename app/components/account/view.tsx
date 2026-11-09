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
    Tooltip,
    Link,
    Dialog,
    DialogTitle,
    DialogContent,
    Button,
} from "@mui/material";
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';

import { lazy, Suspense, useState, type Dispatch, type SetStateAction } from "react";

import type { TableAccount } from "~/model/table";
import { GridCardContainer, GridCardItem } from "~/hooks/card_view";
import { pushMsg, pushTaskSuccess } from "~/components/error_popout";
import DeleteConfirmDialog from "~/components/delete_confirm";
import { syncSubmit } from "~/function/account";
import UserAvatar from "../avatar";
import AccountDetailView from "./view_index";

const SyncDetailsDialog = lazy(() => import("./sync_details"));
const SyncSettingsDialog = lazy(() => import("./sync_settings"));


function CompletelySyncConfirmDialog({ uid, onClose }: { uid: number; onClose: () => void }) {
    return (
        <Dialog open onClose={onClose}>
            <DialogTitle>Confirm Complete Sync</DialogTitle>
            <DialogContent>
                This will sync the accounts completely, which may take a long time. Are you sure you want to proceed?
            </DialogContent>
            <Box sx={{ display: "flex", justifyContent: "flex-end", p: 2 }}>
                <Box sx={{ display: "flex", gap: 3 }}>
                    <Button
                        onClick={onClose}
                        variant="outlined"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={() => {
                            syncSubmit({ uid, complete: true })
                                .then((task_uid) => pushTaskSuccess(`Sync task submitted. UID: ${task_uid}.`))
                                .catch(() => {
                                    // syncSubmit already displays the submission error.
                                });
                            onClose();
                        }}
                        variant="contained">
                        Confirm
                    </Button>
                </Box>
            </Box>
        </Dialog>
    );
}

function ActionList({ account, anchorEl, onClose }: {
    account: TableAccount | null;
    anchorEl: HTMLElement | undefined;
    onClose: () => void;
}) {
    const [openDelete, setOpenDelete] = useState<[number, string] | null>(null);
    const [openCompletelySync, setOpenCompletelySync] = useState<number | null>(null);
    const [syncDetailsUid, setSyncDetailsUid] = useState<number | null>(null);


    return (
        <>
            {syncDetailsUid !== null &&
                <Suspense fallback={null}>
                    <SyncDetailsDialog uid={syncDetailsUid} onClose={() => setSyncDetailsUid(null)} />
                </Suspense>
            }
            {openDelete !== null &&
                <DeleteConfirmDialog
                    onClose={(needDelete) => setOpenDelete(null)}
                    confirmKey={openDelete[1]}
                    remind={<>
                        All related data will be deleted, including the <b>posts</b> and <b>files</b> that belong to the account.
                    </>}
                />
            }
            {openCompletelySync !== null &&
                <CompletelySyncConfirmDialog
                    uid={openCompletelySync}
                    onClose={() => setOpenCompletelySync(null)}
                />
            }
            {account !== null && Boolean(anchorEl) &&
                <Suspense fallback={null}>
                    <SyncSettingsDialog
                        uid={account.uid}
                        onClose={onClose}
                        actions={
                            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                                <Button
                                    disabled={!account.platform || !account.pid}
                                    onClick={() => {
                                        syncSubmit({ uid: account.uid })
                                            .then((task_uid) => {
                                                pushTaskSuccess(`Sync task submitted. UID: ${task_uid}.`);
                                                onClose();
                                            })
                                            .catch(() => {
                                                // syncSubmit already displays the submission error.
                                            });
                                    }}
                                >
                                    Sync now
                                </Button>
                                <Button onClick={() => {
                                    setSyncDetailsUid(account.uid);
                                    onClose();
                                }}>Sync details</Button>
                                <Button color="warning" disabled={!account.platform || !account.pid} onClick={() => {
                                    setOpenCompletelySync(account.uid);
                                    onClose();
                                }}>Complete sync</Button>
                                <Button color="error" onClick={() => {
                                    setOpenDelete([account.uid, account.alias]);
                                    onClose();
                                }}>Delete account</Button>
                            </Box>
                        }
                    />
                </Suspense>
            }
        </>
    );
}



function ViewCore({ component, accounts }: {
    component: (
        setOpenIndex: Dispatch<SetStateAction<number | null>>,
        setActionAnchor: Dispatch<SetStateAction<[HTMLElement, number] | null>>
    ) => React.ReactElement;
    accounts: TableAccount[];
}) {
    const [openIndex, setOpenIndex] = useState<number | null>(null);
    const [actionAnchor, setActionAnchor] = useState<[HTMLElement, number] | null>(null);

    return (
        <>
            {openIndex !== null &&
                <AccountDetailView
                    account={accounts[openIndex]}
                    onClose={() => setOpenIndex(null)}
                    onNext={() => setOpenIndex((prev) => {
                        if (prev === null)
                            return null;
                        if (prev < accounts.length - 1)
                            return prev + 1;
                        else {
                            pushMsg("This is the last account.", "info");
                            return prev;
                        }
                    })}
                    onLast={() => setOpenIndex((prev) => {
                        if (prev === null)
                            return null;
                        if (prev > 0)
                            return prev - 1;
                        else {
                            pushMsg("This is the first account.", "info");
                            return prev;
                        }
                    })}
                />
            }
            <ActionList
                account={actionAnchor !== null ? accounts[actionAnchor[1]] : null}
                anchorEl={actionAnchor?.[0]}
                onClose={() => setActionAnchor(null)}
            />
            {component(setOpenIndex, setActionAnchor)}
        </>
    );
}

export function ListView({ accounts }: { accounts: TableAccount[] }) {
    return (
        <ViewCore component={(setOpenIndex, setActionAnchor) =>
            <TableContainer>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Platform</TableCell>
                            <TableCell align="center">Avatar</TableCell>
                            <TableCell>Alias</TableCell>
                            <TableCell sx={{ width: "100%", minWidth: 188 }}>Overview</TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }} align="center">Last Updated</TableCell>
                            <TableCell sx={{ whiteSpace: "nowrap" }} align="center">Create Time</TableCell>
                            <TableCell align="center">Sync</TableCell>
                            <TableCell>Link</TableCell>
                            <TableCell />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {accounts.map((account, index) =>
                            <TableRow key={account.uid} onClick={() => setOpenIndex(index)} sx={{ cursor: "pointer" }}>
                                <TableCell sx={{ whiteSpace: "nowrap" }}>{account.platform?.toUpperCase()}</TableCell>
                                <TableCell align="center">
                                    <UserAvatar uid={account.avatar} size={38} />
                                </TableCell>
                                <TableCell sx={{ whiteSpace: "nowrap" }}>{account.alias}</TableCell>
                                <TableCell>{account.overview}</TableCell>
                                <TableCell sx={{ whiteSpace: "nowrap" }} align="center">
                                    {account.latest_update ? new Date(account.latest_update).toLocaleString() : "Never"}
                                </TableCell>
                                <TableCell sx={{ whiteSpace: "nowrap" }} align="center">
                                    {new Date(account.create_time).toLocaleString()}
                                </TableCell>
                                <TableCell align="center">
                                    {account.sync_status
                                        ? <Tooltip title={`UID: ${account.sync_task}`}>
                                            <TaskAltRoundedIcon color="success" />
                                        </Tooltip>
                                        : <CancelRoundedIcon color="error" />
                                    }
                                </TableCell>
                                <TableCell sx={{ gap: 1 }}>
                                    {account.url &&
                                        <Link
                                            href={account.url.startsWith("http") ? account.url : `https://${account.url}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            Link
                                        </Link>
                                    }
                                </TableCell>
                                <TableCell>
                                    <IconButton aria-label="Account settings and actions" onClick={(e) => {
                                        e.stopPropagation();
                                        setActionAnchor([e.currentTarget, index]);
                                    }}>
                                        <MoreVertRoundedIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        } accounts={accounts} />
    );
}

export function CardView({ accounts }: { accounts: TableAccount[] }) {
    const [size, setSize] = useState(3);
    const [showDetail, setShowDetail] = useState(false);

    return (
        <ViewCore component={(setOpenIndex, setActionAnchor) =>
            <GridCardContainer setSize={setSize} setShowDetail={setShowDetail}>
                {accounts.map((account, index) => (
                    <GridCardItem size={size} key={account.uid} onClick={() => setOpenIndex(index)}>
                        <CardHeader
                            avatar={<UserAvatar uid={account.avatar} size={43} />}
                            action={
                                <IconButton aria-label="Account settings and actions" onClick={(e) => {
                                    e.stopPropagation();
                                    setActionAnchor([e.currentTarget, index]);
                                }}>
                                    <MoreVertRoundedIcon />
                                </IconButton>
                            }
                            title={account.alias}
                            subheader={account.platform?.toUpperCase()}
                        />
                        <CardMedia
                            component={"img"}
                            sx={{ aspectRatio: "16/9", objectFit: "cover" }}
                            image={`/api/file/${account.cover}`}
                            alt={`File UID ${account.cover}`}
                        />
                        <CardContent>
                            <Typography variant="body1" sx={{ overflowWrap: "anywhere" }}>
                                {account.overview}
                            </Typography>
                            {showDetail &&
                                <>
                                    <Divider sx={{ my: 1 }} />
                                    {([
                                        [
                                            account.latest_update ? `Last Updated: ${new Date(account.latest_update).toLocaleDateString()}` : "Last Updated: Never",
                                            account.sync_status ? "Synced" : "Sync Failed",
                                        ],
                                        [
                                            account.gender === true ? "Male" : account.gender === false ? "Female" : "",
                                            account.age ? `${account.age} years old` : "",
                                        ],
                                        [
                                            account.address ?? "",
                                            account.ip ? `IP: ${account.ip}` : "",
                                            account.school ?? "",
                                        ]
                                    ] as string[][]).map((texts, index) =>
                                        <Box key={index} sx={{ display: "flex", flexDirection: "row", gap: 1.8 }}>
                                            {texts.filter((text) => text !== "").map((text, index) =>
                                                <Typography key={index} variant="body2" sx={{ color: "text.secondary" }}>
                                                    {text}
                                                </Typography>
                                            )}
                                        </Box>
                                    )}
                                </>
                            }
                        </CardContent>
                    </GridCardItem>
                ))}
            </GridCardContainer>
        } accounts={accounts} />
    );
}
