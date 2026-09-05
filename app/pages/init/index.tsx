import {
    Box,
    Typography,
    Fab,
    useTheme,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Collapse,
    TextField,
    Alert,
    AlertTitle,
    Autocomplete,
    useMediaQuery,
} from "@mui/material";
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';

import { useNavigate } from "react-router";
import { useState } from "react";

import type { TableSettings } from "~/model/table";
import type { DatabaseConfig } from "~/model/status";
import { api } from "~/hooks/api";
import { pushError } from "~/components/error_popout";
import { useStatus } from "~/hooks/status";
import { NextButton, ConfigInput, LsItem } from "~/pages/init/components";
import { fetchSettings, updateSettings } from "~/function/setting";
import PathSelector from "~/components/pathselector";
import ApiInit from "~/pages/init/api_init";
import TypeWriterMotion from "~/pages/init/title_animation";

export default function Init() {
    const theme = useTheme();
    const navigate = useNavigate();
    const downMd = useMediaQuery(theme.breakpoints.down("md"));

    const [started, setStarted] = useState(-1);
    const [config, setConfig] = useState<TableSettings>();
    const [dbConfig, setDbConfig] = useState<DatabaseConfig>({} as DatabaseConfig);
    const { data, refetch } = useStatus();
    const { model_status, api_status } = data || {};

    return (
        <Box sx={{
            display: "flex",
            flexDirection: { md: "row", xs: "column" },
            width: "100vw",
        }}>
            <Box sx={{
                display: "flex",
                flexDirection: "column",
                width: { md: "38.2vw", xs: "100vw" },
                height: "100vh",
                backgroundColor: theme.vars?.palette.primary.main,
            }}>
                <Box sx={{
                    p: 6,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    alignContent: "center",
                    height: "100%",
                    width: "100%",
                }} >
                    <Box sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: { md: 8, xs: 3 },
                        width: "100%",
                        height: "100%",
                    }}>
                        <TypeWriterMotion
                            text="Welcome to Media Harbor!"
                            speed={88}
                            style={{
                                fontSize: "68px",
                                fontWeight: "1000",
                                color: theme.vars?.palette.primary.contrastText,
                            }}
                        />
                        <TypeWriterMotion
                            text="Let's set up your own media library NOW!"
                            delay={2500}
                            speed={38}
                            style={{
                                fontSize: "28px",
                                color: theme.vars?.palette.background.paper,
                            }}
                        />
                    </Box>
                    <Fab
                        variant="extended"
                        size="medium"
                        color="secondary"
                        sx={{ gap: 3 }}
                        onClick={async () => {
                            if (started !== -1) return;

                            if (model_status?.database) {
                                const res = await fetchSettings();
                                setConfig(res);
                            }

                            api.get("/api/system/database").json<DatabaseConfig>()
                                .then((res) => {
                                    setDbConfig(res);
                                    if (!model_status?.database) setStarted(0);
                                    else if (!model_status?.settings) setStarted(1);
                                    else if (!model_status?.logger) setStarted(2);
                                    else if (!model_status?.aria2) setStarted(3);
                                    else if (!model_status?.apis) setStarted(4);
                                    else if (!model_status?.base) setStarted(5);
                                    else navigate("/dashboard");

                                    if (downMd) {
                                        window.scrollTo({
                                            top: window.innerHeight,
                                            behavior: "smooth",
                                        });
                                    }
                                })
                                .catch((e) => pushError(e, "Fetch Database"));

                        }}>
                        <Typography variant="h6" sx={{ fontWeight: "bold", color: theme.vars?.palette.secondary.contrastText }}>
                            Get Started!
                        </Typography>
                        <ArrowDownwardRoundedIcon sx={{ display: { md: "none", xs: "block" } }} />
                        <ArrowForwardRoundedIcon sx={{ display: { md: "block", xs: "none" } }} />
                    </Fab>
                </Box>

            </Box>
            <Box sx={{
                px: { md: 6, xs: 3 },
                py: { md: 3, xs: 1 },
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-start",
                alignContent: "center",
                width: { md: "61.8vw", xs: "100vw" },
                height: "100vh",
                backgroundColor: theme.vars?.palette.background.default,
                overflow: "scroll",
                '&::-webkit-scrollbar': {
                    display: 'none',
                },
            }
            } >
                {started !== -1 &&
                    <>
                        <List>
                            <LsItem name="Database" data={model_status?.database} onClick={started > 0 ? () => setStarted((prev) => prev > 0 ? 0 : prev) : null} />
                            <ListItem>
                                <Collapse in={started == 0} timeout="auto" sx={{ display: "flex", width: "100%" }}>
                                    {([
                                        ["Host", "The host for the database.", dbConfig.host, (value: string) => setDbConfig((prev) => ({ ...prev, host: value }))],
                                        ["Port", "The port for the database.", dbConfig.port.toString(), (value: string) => setDbConfig((prev) => ({ ...prev, port: Number(value) }))],
                                        ["User", "The user for the database.", dbConfig.user, (value: string) => setDbConfig((prev) => ({ ...prev, user: value }))],
                                        ["Password", "The password for the database.", dbConfig.password, (value: string) => setDbConfig((prev) => ({ ...prev, password: value }))],
                                        ["Database", "The database name.", dbConfig.database, (value: string) => setDbConfig((prev) => ({ ...prev, database: value }))],
                                    ] as [string, string, string, (value: string) => void][]).map(([name, description, value, setValue]) => (
                                        <ConfigInput
                                            key={name}
                                            name={name}
                                            description={description}
                                            value={value}
                                            setValue={setValue}
                                        />))}
                                    <NextButton onClick={() => {
                                        api.post("/api/init/database", { json: dbConfig }).json()
                                            .then(async () => {
                                                const res = await fetchSettings();
                                                setConfig(res);
                                                setStarted(1);
                                                refetch();
                                            })
                                            .catch((e) => pushError(e, "Init Database:"));
                                    }} />
                                </Collapse>
                            </ListItem>
                            <LsItem name="Settings" data={model_status?.settings} onClick={started > 1 ? () => setStarted((prev) => prev > 1 ? 1 : prev) : null} />
                            <ListItem>
                                <Collapse in={started == 1} timeout="auto" sx={{ display: "flex", width: "100%" }}>
                                    <Alert severity="warning" variant="filled" sx={{ mb: 3 }}>
                                        <AlertTitle>
                                            <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                                                Warning
                                            </Typography>
                                        </AlertTitle>
                                        <Typography variant="subtitle1">
                                            Make sure that the path can be accessed by both backend and downloader. <br />
                                            If you are using docker, it should be a mounted volume shared by the two containers. <br />
                                            If once set, it will not be able to change.
                                        </Typography>
                                    </Alert>
                                    {started == 1 &&
                                        <PathSelector
                                            label="MediaHarbor Path"
                                            value={config?.data_path || "/"}
                                            onClose={(value) =>
                                                setConfig((prev) => ({ ...(prev ?? {}), data_path: value, aria2_path: value } as TableSettings))
                                            }
                                        />
                                    }
                                    <NextButton onClick={() => {
                                        updateSettings({ "data_path": config?.data_path || "/" })
                                            .then((res) => {
                                                setConfig(res);
                                                setStarted(2);
                                                refetch();
                                            })
                                    }} />
                                </Collapse>
                            </ListItem>
                            <LsItem name="Logger" data={model_status?.logger} onClick={started > 2 ? () => setStarted((prev) => prev > 2 ? 2 : prev) : null} />
                            <ListItem>
                                <Collapse in={started == 2} timeout="auto" sx={{ display: "flex", width: "100%" }}>
                                    <Autocomplete
                                        fullWidth
                                        disablePortal
                                        defaultValue={config?.log_level || "ERROR"}
                                        options={["INFO", "WARNING", "ERROR", "DEBUG"]}
                                        onChange={(_, value) => {
                                            if (value)
                                                setConfig((prev) => prev ? ({ ...prev, log_level: value }) : prev)
                                        }}
                                        renderInput={(params) => <TextField
                                            {...params}
                                            multiline
                                            label={"Log Level"}
                                            variant="outlined"
                                        />}
                                    />
                                    <NextButton onClick={() => {
                                        updateSettings({ "log_level": config?.log_level || "ERROR" });
                                        api.get("/api/init/logger")
                                            .then(() => {
                                                setStarted(3);
                                                refetch();
                                            })
                                            .catch((e) => pushError(e, "Init Logger"));
                                    }} />
                                </Collapse>
                            </ListItem>
                            <LsItem name="Downloader" data={model_status?.aria2} onClick={started > 3 ? () => setStarted((prev) => prev > 3 ? 3 : prev) : null} />
                            <ListItem>
                                <Collapse in={started == 3} timeout="auto" sx={{ display: "flex", width: "100%" }}>
                                    {([
                                        ["Host", "The host for the aria2 RPC server.", config?.aria2_host || "localhost", (value: string) => setConfig((prev) => prev ? ({ ...prev, aria2_host: value }) : prev)],
                                        ["Port", "The port for the aria2 RPC server.", config?.aria2_port?.toString() || "38887", (value: string) => setConfig((prev) => prev ? ({ ...prev, aria2_port: Number(value) }) : prev)],
                                        ["Secret", "The secret token for the aria2 RPC server. If not set, it will be treated as no secret.", config?.aria2_secret || "", (value: string) => setConfig((prev) => prev ? ({ ...prev, aria2_secret: value }) : prev)],
                                    ] as [string, string, string, (value: string) => void][]).map(([name, description, value, setValue]) => (
                                        <ConfigInput
                                            key={name}
                                            name={name}
                                            description={description}
                                            value={value}
                                            setValue={setValue}
                                        />
                                    ))}
                                    <Alert severity="warning" variant="filled" sx={{ mb: 3 }}>
                                        <AlertTitle>
                                            <Typography variant="h6" sx={{ fontWeight: "bold" }}>
                                                Warning
                                            </Typography>
                                        </AlertTitle>
                                        <Typography variant="subtitle1">
                                            Make sure that the path is same as you have configured for the backend. <br />
                                            If you are using docker, it should be the path inside the aria2 container. <br />
                                            If once set, it will not be able to change.
                                        </Typography>
                                    </Alert>
                                    <TextField
                                        label="Aria2 Path"
                                        value={config?.aria2_path}
                                        fullWidth
                                        onChange={(e) => setConfig((prev) => ({ ...(prev ?? {}), aria2_path: e.target.value } as TableSettings))}
                                        slotProps={{
                                            inputLabel: {
                                                shrink: true,
                                            },
                                        }}
                                    />
                                    <NextButton onClick={() => {
                                        updateSettings({
                                            "aria2_host": config?.aria2_host || "localhost",
                                            "aria2_port": config?.aria2_port?.toString() || "38887",
                                            "aria2_secret": config?.aria2_secret || "",
                                            "aria2_path": config?.aria2_path || "/",
                                        });
                                        api.get("/api/init/downloader")
                                            .then(() => {
                                                setStarted(4);
                                                refetch();
                                            })
                                            .catch((e) => pushError(e, "Init Downloader"));
                                    }} />
                                </Collapse>
                            </ListItem>
                            <LsItem name="Apis" data={model_status?.apis} onClick={started > 4 ? () => setStarted((prev) => prev > 4 ? 4 : prev) : null} />
                            <ListItem>
                                <Collapse in={started == 4} timeout="auto" sx={{ display: "flex", width: "100%" }}>
                                    <ApiInit
                                        onEnd={(err) => { if (!err) refetch(); }}
                                        onNext={() => {
                                            api.get("/api/init/base").then(() => refetch());
                                            setStarted(5);
                                        }}
                                    />
                                </Collapse>
                            </ListItem>
                            <LsItem name="Base Services" data={model_status?.base} onClick={started > 5 ? () => setStarted((prev) => prev > 5 ? 5 : prev) : null} />
                            <ListItem>
                                <Collapse in={started == 5 && !model_status?.base} timeout="auto" sx={{ display: "flex", width: "100%" }}>
                                    <List>
                                        {([
                                            ["Statistic Service", model_status?.statistic],
                                            ["Delete Service", model_status?.delete],
                                            ["Queue Service", model_status?.queue],
                                        ] as [string, boolean | null | undefined][]).map(([name, data]) => (
                                            <ListItem key={name}>
                                                <ListItemIcon>
                                                    {data
                                                        ? <CheckCircleRoundedIcon color="success" />
                                                        : <ErrorRoundedIcon color="error" />
                                                    }
                                                </ListItemIcon>
                                                <ListItemText>
                                                    <Typography variant="subtitle1" sx={{ fontWeight: "bold" }}>
                                                        {name}
                                                    </Typography>
                                                </ListItemText>
                                            </ListItem>
                                        ))}
                                    </List>
                                    <NextButton onClick={() => {
                                        api.get("/api/init/base")
                                            .then(() => refetch())
                                            .catch((e) => pushError(e, "Init Base Services"));
                                    }} label="Retry" />
                                </Collapse>
                            </ListItem>
                        </List>
                        {started === 5 &&
                            <NextButton onClick={() => navigate("/dashboard")} label="Finish" />}
                    </>
                }
            </Box>
        </Box >
    )
}