import {
    Box,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    List,
    Collapse,
    TableContainer,
    Table,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
} from "@mui/material";
import PlayCircleRoundedIcon from '@mui/icons-material/PlayCircleRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import PauseCircleRoundedIcon from '@mui/icons-material/PauseCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';

import { useState, Fragment } from "react";

import { useOutletContext } from "react-router";

import AppBar from "~/components/appbar";
import type { Status } from "~/model/enum";
import { StatusCore } from "./components"


export default function TasksPage() {
    const { mobilDrawer } =
        useOutletContext<{
            appBarHeight: number,
            drawerWidth: number,
            mobilDrawer: () => void,
        }>();
    const [show, setShow] = useState<[boolean, boolean, boolean, boolean]>([true, true, false, false]); // running, failed, pending, completed

    return (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <AppBar mobilDrawer={mobilDrawer} label="Tasks" />
            <List sx={{ overflowY: "auto" }} >
                {([
                    ["Running", <PlayCircleRoundedIcon color="primary" />, "running"],
                    ["Error", <ErrorRoundedIcon color="error" />, "error"],
                    ["Pending", <PauseCircleRoundedIcon />, "pending"],
                    ["Success", <CheckCircleRoundedIcon color="success" />, "success"],
                ] as [string, React.ReactNode, Status][]).map(([label, icon, state], index) => (
                    <Fragment key={index}>
                        <ListItemButton onClick={() => setShow((prev) => {
                            const newShow = [...prev] as [boolean, boolean, boolean, boolean];
                            newShow[index] = !newShow[index];
                            return newShow;
                        })}>
                            <ListItemIcon>
                                {icon}
                            </ListItemIcon>
                            <ListItemText>
                                {label}
                            </ListItemText>
                            <ListItemIcon>
                                {show[index] ? <ExpandLessRoundedIcon /> : <ExpandMoreRoundedIcon />}
                            </ListItemIcon>
                        </ListItemButton>
                        <Collapse in={show[index]} timeout="auto" unmountOnExit>
                            <TableContainer sx={{ px: 2, py: 0 }}>
                                <Table stickyHeader size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>UID</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell>Alias</TableCell>
                                            <TableCell>Schedule</TableCell>
                                            <TableCell>Create</TableCell>
                                            <TableCell>Actions</TableCell>
                                            <TableCell />
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        <StatusCore state={state} />
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Collapse>
                    </Fragment>
                ))}
            </List >
        </Box >
    )
}