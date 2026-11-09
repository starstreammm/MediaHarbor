import {
    Box,
    useMediaQuery,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    IconButton,
    Stepper,
    Step,
    StepLabel,
    Typography,
    Divider,
} from "@mui/material";
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import KeyboardArrowLeftRoundedIcon from '@mui/icons-material/KeyboardArrowLeftRounded';
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded';

import { useState, useRef } from "react";

import type { ApiCreatorCreate, InsertRef } from "~/model/api";
import { pushTaskSuccess } from "~/components/error_popout";
import { api } from "~/hooks/api";
import { StepOne, StepTwo, StepThree } from "./components";
import { pushError } from "../error_popout";


export default function AddCreatorDialog({ onClose }: {
    onClose: (uid: number | null) => void
}) {
    // const
    const isUpMd = useMediaQuery((theme) => theme.breakpoints.up('md'), { noSsr: true });
    const label = [
        "Insert the first Account",
        "Confirm the Creator's information",
        "Continue to insert more Accounts"
    ];

    // state
    const [firstReady, setFirstReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeStep, setActiveStep] = useState(0);
    const setpRef = useRef<InsertRef<ApiCreatorCreate, void>>(null);

    // data
    const [insert, setInsert] = useState<ApiCreatorCreate>({} as ApiCreatorCreate);

    // Handle Next and Back
    const handleNext = async () => {
        if (loading) return;
        if (activeStep === 0) {
            if (!firstReady) return;
            setLoading(true);
            try {
                const data = setpRef.current?.resData();
                if (!data) return;
                const first = data.accounts[0];
                if (data.avatar === undefined && "avatar" in first) {
                    if (typeof first.avatar === "number") {
                        data.avatar = first.avatar;
                    } else if (first.avatar && first.url) {
                        data.avatar = await api.post("/api/account/avatar/preview", {
                            searchParams: { url: first.url }, timeout: false,
                        }).json<number | null>() ?? undefined;
                    }
                }
                setInsert(data);
                setActiveStep(1);
            } catch (error) {
                pushError(error, "Prepare first account");
            } finally {
                setLoading(false);
            }
            return;
        }
        if (activeStep === 1) {
            if (insert.alias && insert.overview)
                setActiveStep(2);
            else
                pushError("Please fill in the Creator's information before proceeding.");
        }
        if (activeStep === 2) {
            if (insert.accounts && insert.accounts.length > 0) {
                setLoading(true);
                api.post("/api/creator/create", { json: insert }).json<number>()
                    .then((res) => {
                        onClose(res);
                        pushTaskSuccess(`Creator import task submitted with ${insert.accounts.length} accounts. UID: ${res}.`);
                    })
                    .catch((error) => pushError("Error creating Creator: " + error.message))
                    .finally(() => setLoading(false));
            }
        }
    }
    const handleBack = () => {
        if (activeStep > 0 && !loading) {
            if (activeStep === 1) setFirstReady(false);
            setActiveStep(activeStep - 1);
        }
    }


    return (
        <Dialog
            open
            fullScreen
            onKeyDown={(e) => {
                if (e.key === "Escape" && !loading) {
                    e.stopPropagation();
                    onClose(null);
                }
            }}
        >
            <DialogTitle>
                {isUpMd
                    ? <Stepper activeStep={activeStep} alternativeLabel>
                        {label.map((label, index) => (
                            <Step key={label}>
                                <StepLabel>Step {index + 1}: {label}</StepLabel>
                            </Step>
                        ))}
                    </Stepper>
                    :
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Typography>
                            Step {activeStep + 1}: {label[activeStep]}
                        </Typography>
                        <IconButton disabled={loading} onClick={() => onClose(null)}>
                            <CloseRoundedIcon />
                        </IconButton>
                    </Box>
                }
            </DialogTitle>
            <Divider variant="middle" flexItem />
            <DialogContent sx={{ p: 0 }}>

                {activeStep === 0 && <StepOne defaultValue={insert} ref={setpRef} onReady={setFirstReady} />}
                {activeStep === 1 && <StepTwo insert={insert} setInsert={setInsert} />}
                {activeStep === 2 && <StepThree accounts={insert.accounts ?? []} setAccounts={setInsert} />}

            </DialogContent>
            {isUpMd && <Divider variant="middle" flexItem />}
            <DialogActions>
                <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5, width: "100%", px: { xs: 0, md: 3 }, py: 1 }}>
                    <Button color="error" variant="outlined" disabled={loading} onClick={() => onClose(null)}>Cancel</Button>
                    <Button variant="outlined" onClick={handleBack} disabled={loading || activeStep === 0} startIcon={<KeyboardArrowLeftRoundedIcon />}>Back</Button>
                    <Button
                        variant="contained"
                        onClick={handleNext}
                        disabled={loading || (activeStep === 0 && !firstReady) || (activeStep === 2 && (insert.accounts ?? []).length === 0)}
                        endIcon={<KeyboardArrowRightRoundedIcon />}
                        loading={loading}
                    >
                        {activeStep === 2 ? "Finish" : "Next"}
                    </Button>
                </Box>
            </DialogActions>
        </Dialog>
    );
}