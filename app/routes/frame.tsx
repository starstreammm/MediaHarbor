import {
    Box,
    IconButton,
    Drawer,
    Avatar,
    Typography,
    Paper,
    useTheme,
    useMediaQuery,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    ListItemAvatar,
    Divider,
    Backdrop,
} from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import AutoAwesomeMosaicRoundedIcon from '@mui/icons-material/AutoAwesomeMosaicRounded';
import PermMediaOutlinedIcon from '@mui/icons-material/PermMediaOutlined';
import PeopleOutlineRoundedIcon from '@mui/icons-material/PeopleOutlineRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import ContrastIcon from '@mui/icons-material/Contrast';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CollectionsRoundedIcon from '@mui/icons-material/CollectionsRounded';
import EventNoteRoundedIcon from '@mui/icons-material/EventNoteRounded';

import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { useLocalStorage } from "~/hooks/storage";
import { clearAllMsg } from '~/components/error_popout';
import { useStatus } from '~/hooks/status';


const fullDrawerWidth = 255, miniDrawerWidth = 64;

export default function Sidebar() {
    // Navigation
    const navigate = useNavigate();

    // Theme
    const theme = useTheme();
    const { mode, setMode } = useColorScheme();
    const preferIsDark = useMediaQuery("(prefers-color-scheme: dark)");

    // Screen size
    const isUpLg = useMediaQuery(theme.breakpoints.up('lg'), { noSsr: true });
    const isUpMd = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });

    // Transition
    const location = useLocation();

    // Drawer
    const [mobilDrawer, setMobilDrawer] = useState(false);
    const [fullDrawer, setFullDrawer] = useState(isUpLg);
    const [drawerWidth, setDrawerWidth] = useState(isUpMd ? isUpLg ? fullDrawerWidth : miniDrawerWidth : 0);

    // Settings & health
    const [themeMode, setThemeMode] = useLocalStorage<'light' | 'dark' | 'system'>('theme-mode', 'system', 'local');
    const [apiConnect, setApiConnect] = useState<boolean>(true);

    const { model_status } = useStatus().data || {}


    const changeThemeMode = () => {
        let newMode: 'light' | 'dark' | 'system' = themeMode;
        if (themeMode === 'system') {
            newMode = preferIsDark ? 'light' : 'dark';
        }
        else if (themeMode === 'light') {
            newMode = preferIsDark ? 'system' : 'dark';
        }
        else if (themeMode === 'dark') {
            newMode = preferIsDark ? 'light' : 'system';
        }
        setMode(newMode);
        setThemeMode(newMode);
    }


    useEffect(() => {
        setMode(themeMode);
    }, [themeMode]);

    useEffect(() => {
        if (isUpMd) {
            setDrawerWidth(fullDrawer ? fullDrawerWidth : miniDrawerWidth);
        }
        else {
            setDrawerWidth(0);
        }
    }, [isUpLg, isUpMd, fullDrawer]);

    useEffect(() => {
        if (!model_status
            || !model_status.database
            || !model_status.settings
            || !model_status.logger
            || !model_status.aria2
            || !model_status.base
            || !model_status.apis
        ) {
            setApiConnect(false);
        }
        else {
            clearAllMsg();
            setApiConnect(true);
        }
    }, [model_status])


    const apiDisconnectBackdrop = (
        <Backdrop
            open={!apiConnect}
            onClick={() => navigate("/")}
            sx={{ zIndex: 8888 }}
        >
            <Box sx={{
                display: "flex",
                width: "100%",
                height: "100%",
                flexDirection: "column",
                justifyContent: "space-around",
                alignItems: "center",
                color: "#fff",
            }}>
                <Typography variant="h3">
                    Cannot connect to server
                </Typography>
                <Typography variant="h4">Click anywhere to the initialize page.</Typography>
            </Box>
        </Backdrop>
    );

    const drawer = (
        <>
            {apiDisconnectBackdrop}
            <List disablePadding>
                <NavLink to="/dashboard" end>
                    <ListItem disablePadding>
                        <ListItemButton disableRipple sx={{
                            pl: 1, height: 80,
                            alignItems: 'center',
                            "&:hover": {
                                backgroundColor: "transparent",
                            },
                            "&.Mui-selected": {
                                backgroundColor: "transparent",
                            },
                            "&.Mui-focusVisible": {
                                backgroundColor: "transparent",
                            },
                        }}>
                            <ListItemAvatar>
                                <Avatar alt="icon" src="/Icon-rounded.svg" sx={{ width: 48, height: 48 }} />
                            </ListItemAvatar>
                            <ListItemText sx={[fullDrawer ? { opacity: 1 } : { opacity: 0 }, { ml: 2 }]}>
                                <Typography variant="h5" sx={{ whiteSpace: 'nowrap' }}>
                                    Media Harbor
                                </Typography>
                            </ListItemText>
                        </ListItemButton>
                    </ListItem>
                </NavLink>
                <Divider orientation="horizontal" variant="middle" flexItem sx={{ mb: 2 }} />
                {([
                    ['Dashboard', <AutoAwesomeMosaicRoundedIcon />],
                    ['Posts', <PermMediaOutlinedIcon />],
                    ['Creators', <PeopleOutlineRoundedIcon />],
                    ['Collections', <CollectionsRoundedIcon />],
                    ['Tasks', <EventNoteRoundedIcon />],
                    ['Logs', <AssignmentRoundedIcon />],
                    ['Settings', <SettingsRoundedIcon />]
                ] as [string, React.ReactNode][]).map(([text, icon]) => {
                    return (
                        <NavLink to={`/${text.toLowerCase()}`} end key={text} >
                            <ListItem disablePadding>
                                <ListItemButton
                                    selected={location.pathname === `/${text.toLowerCase()}`}
                                    sx={{ pl: 2.5, py: 1.8 }}
                                >
                                    <ListItemIcon>
                                        {icon}
                                    </ListItemIcon>
                                    <ListItemText primary={text} sx={[fullDrawer ? { opacity: 1 } : { opacity: 0 }, { ml: 0.5 }]} />
                                </ListItemButton>
                            </ListItem>
                        </NavLink>
                    )
                }
                )}
            </List>
            <Box sx={[
                { p: 2.5, display: "flex" },
                fullDrawer ?
                    { justifyContent: "space-between" }
                    :
                    {
                        flexDirection: 'column-reverse',
                        gap: 2,
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                    }
            ]}>
                <IconButton onClick={() => changeThemeMode()} >
                    <ContrastIcon />
                </IconButton>
                <Paper
                    elevation={fullDrawer ? 8 : 0}
                    sx={{
                        borderRadius: '50%',
                        display: useMediaQuery(theme.breakpoints.up('md')) ? 'flex' : 'none',
                        transition: theme.transitions.create(['background-color', 'width', 'box-shadow'], {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.complex,
                        }),
                    }}>
                    <IconButton
                        aria-label='mini variant drawer'
                        color="primary"
                        onClick={() => setFullDrawer(!fullDrawer)}
                    >
                        <ChevronLeftRoundedIcon sx={{ display: fullDrawer ? 'flex' : 'none' }} />
                        <ChevronRightRoundedIcon sx={{ display: fullDrawer ? 'none' : 'flex' }} />
                    </IconButton>
                </Paper>
            </Box>
        </>
    )

    return (
        <>
            <Drawer
                open={mobilDrawer}
                variant="temporary"
                onClose={() => setMobilDrawer(false)}
                sx={{
                    display: { xs: 'flex', md: 'none' },
                    "& .MuiDrawer-paper": {
                        flexDirection: "column",
                        justifyContent: "space-between",
                        flexShrink: 0,
                        boxSizing: 'border-box',
                        width: fullDrawerWidth,
                        transition: theme.transitions.create(['width', 'background-color'], {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.complex,
                        }),
                    }
                }}
                slotProps={{
                    root: {
                        keepMounted: true,
                    },
                }}>
                {drawer}
            </Drawer>
            <Drawer
                open={fullDrawer}
                variant="permanent"
                sx={{
                    display: { xs: 'none', md: 'flex' },
                    "& .MuiDrawer-paper": {
                        flexDirection: "column",
                        justifyContent: "space-between",
                        width: drawerWidth,
                        flexShrink: 0,
                        boxSizing: 'border-box',
                        overflowX: 'hidden',
                        overflowY: 'auto',
                        transition: theme.transitions.create(['width', 'background-color'], {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.complex,
                        }),
                    }
                }}>
                {drawer}
            </Drawer>
            <Box component="main" sx={{
                ml: `${drawerWidth}px`,
                width: `calc(100% - ${drawerWidth}px)`,
                height: '100vh',
                bgcolor: theme.vars?.palette.background.default,
                transition: theme.transitions.create(['background-color', 'width', 'margin-left'], {
                    easing: theme.transitions.easing.sharp,
                    duration: theme.transitions.duration.complex,
                }),
            }} >
                <Outlet context={{
                    appBarHeight: 80,
                    drawerWidth: drawerWidth,
                    mobilDrawer: () => {
                        if (mobilDrawer) {
                            setMobilDrawer(false);
                        }
                        else {
                            setMobilDrawer(true);
                            setFullDrawer(true);
                        }
                    },
                }} />
            </Box>
        </>
    );
}