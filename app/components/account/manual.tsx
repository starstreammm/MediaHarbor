import {
    Box,
    TextField,
    Typography,
    Autocomplete,
    Alert,
    AlertTitle,
    ButtonBase,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
} from "@mui/material";
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';

import {
    useState,
    forwardRef,
    useImperativeHandle,
    type ForwardedRef,
    type Dispatch,
    type SetStateAction,
} from "react";

import type { ApiAccountInsert, InsertRef } from "~/model/api";
import { Platform } from "~/model/enum";
import { urlRegex } from "~/model/const";
import UserAvatar from "~/components/avatar";
import { FileInput } from "~/hooks/file";
import { insertSubmit } from "../../function/account";
import { pushError } from "../error_popout";

export default forwardRef(ManualInsert);

function ManualInsert(
    {
        open,
        setType,
        defaultValue = { creator_uid: -1 } as ApiAccountInsert
    }: {
        open: boolean;
        setType?: Dispatch<SetStateAction<string>>;
        defaultValue?: ApiAccountInsert;
    },
    ref: ForwardedRef<InsertRef<ApiAccountInsert, number>>,
) {
    if (!open) return null;

    const [insert, setInsert] = useState<ApiAccountInsert>(defaultValue);

    useImperativeHandle(ref, () => ({
        resData() {
            if (insert.alias && insert.overview) {
                return insert;
            }
            else {
                pushError("Please fill in the required fields.");
                throw new Error("Invalid data");
            }
        },
        submit() {
            if (insert.alias && insert.overview) {
                return insertSubmit(insert);
            }
            else {
                pushError("Please fill in the required fields.");
                throw new Error("Invalid data");
            }
        },
    }));

    return (
        <>
            <Alert severity="warning">
                <AlertTitle>Auto Sync Unavailable</AlertTitle>

                Auto Sync is not available for manually inserted accounts.<br />

                If you want to add an existing account which url is available, please use
                {(["Bulk Import", "", "URL Parser"] as string[]).map((v) => {
                    if (!v) return " or ";
                    else return (
                        <ButtonBase
                            onClick={() => setType && setType(v)}
                            sx={{
                                display: "inline",
                                color: (t) => t.vars?.palette.primary.main,
                                textDecoration: "underline",
                                mx: 0.5,
                            }}>
                            {v}
                        </ButtonBase>
                    );
                })}
                instead.<br />

                Use manual insert <b>only</b> when you want to add accounts that are <b>not available on the internet</b> and you'd like to manage them with MediaHarbor anyway.
            </Alert>

            <Typography variant="h6" sx={{ fontWeight: "bold", mt: { xs: 1, md: 3 } }}>
                Required Information
            </Typography>
            <Box sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: { xs: "space-between", md: "flex-start" },
                gap: { xs: 0, md: 8 },
            }}>
                <UserAvatar uid={insert?.avatar} size={88} onChange={(uid) => setInsert((prev) => ({ ...prev, avatar: uid }))} />
                <TextField
                    required
                    label="Alias"
                    value={insert.alias}
                    onChange={(e) => setInsert((prev) => ({ ...prev, alias: e.target.value }))}
                />
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
            <Typography variant="h6" sx={{ fontWeight: "bold", mt: { xs: 1, md: 3 } }}>
                Additional Information
            </Typography>
            <Autocomplete
                sx={{ maxWidth: 288 }}
                options={Platform}
                value={insert.platform}
                onChange={(_, newValue) => setInsert((prev) => ({ ...prev, platform: newValue ?? undefined }))}
                renderInput={(params) => <TextField {...params} label="Platform" />}
            />
            <TextField
                label="pid"
                fullWidth
                value={insert.pid}
                onChange={(e) => setInsert((prev) => ({ ...prev, pid: e.target.value }))}
            />
            <TextField
                label="url"
                fullWidth
                error={insert?.url ? insert.url.match(urlRegex) === null : false}
                value={insert.url}
                onChange={(e) => setInsert((prev) => ({ ...prev, url: e.target.value }))}
            />
            <TextField
                sx={{ maxWidth: 188 }}
                label="Age"
                fullWidth
                type="number"
                value={insert.age}
                error={insert?.age ? (isNaN(Number(insert?.age)) || Number(insert?.age) < 0) : false}
                onChange={(e) => setInsert((prev) => ({ ...prev, age: Number(e.target.value) ?? undefined }))}
            />
            <FormControl sx={{ maxWidth: 188 }}>
                <InputLabel>Gender</InputLabel>
                <Select
                    label="Gender"
                    value={insert.gender}
                    onChange={(e) => setInsert((prev) => ({ ...prev, gender: e.target.value === "true" ? true : e.target.value === "false" ? false : undefined }))}
                >
                    <MenuItem value={""}>None</MenuItem>
                    <MenuItem value={"true"}>Male</MenuItem>
                    <MenuItem value={"false"}>Female</MenuItem>
                </Select>
            </FormControl>
            <TextField
                sx={{ maxWidth: 188 }}
                label="IP Address"
                fullWidth
                value={insert.ip}
                onChange={(e) => setInsert((prev) => ({ ...prev, ip: e.target.value }))}
            />
            <TextField
                label="Address"
                fullWidth
                value={insert.address}
                onChange={(e) => setInsert((prev) => ({ ...prev, address: e.target.value }))}
            />
            <TextField
                label="School"
                fullWidth
                value={insert.school}
                onChange={(e) => setInsert((prev) => ({ ...prev, school: e.target.value }))}
            />
            <Typography variant="body1">
                Cover
            </Typography>
            <ButtonBase component="label">
                {insert.cover
                    ?
                    <Box
                        component="img"
                        src={`/api/file/${insert.cover}`}
                        alt="cover"
                        sx={{
                            width: "100%",
                            height: 333,
                            objectFit: "contain",
                            borderRadius: 3,
                        }}
                    />
                    :
                    <Box
                        sx={{
                            width: "100%",
                            height: 333,
                            borderRadius: 3,
                            border: "1px dashed #ccc",
                            bgcolor: (t) => t.vars?.palette.background.paper,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            "&:hover": {
                                bgcolor: (t) => t.vars?.palette.background.default,
                                borderColor: "#aaa",
                            },
                        }}
                    >
                        <UploadFileRoundedIcon />
                        <Typography
                            variant="body1"
                            sx={{ color: "text.secondary", ml: 1 }}
                        >
                            Upload Cover
                        </Typography>
                    </Box>
                }
                <FileInput onEnd={(_, uid) => setInsert((prev) => ({ ...prev, cover: uid }))} />
            </ButtonBase>
        </>
    );
}