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
    MobileStepper,
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
    const [loading, setLoading] = useState(false);
    const [activeStep, setActiveStep] = useState(0);
    const setpRef = useRef<InsertRef<ApiCreatorCreate, void>>(null);

    // data
    const [insert, setInsert] = useState<ApiCreatorCreate>({} as ApiCreatorCreate);

    // Handle Next and Back
    const handleNext = () => {
        if (activeStep === 0) {
            const data = setpRef.current?.resData();
            if (!data) { return; }
            setInsert(data);
            setActiveStep(1);
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
                        pushTaskSuccess(`Creator added successfully with ${insert.accounts.length} accounts. Task UID: ${res}.`);
                    })
                    .catch((error) => pushError("Error creating Creator: " + error.message))
                    .finally(() => setLoading(false));
            }
        }
    }
    const handleBack = () => {
        if (activeStep > 0) {
            setActiveStep(activeStep - 1);
        }
    }


    return (
        <Dialog
            open
            fullScreen
            onKeyDown={(e) => {
                if (e.key === "Escape") {
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
                        <IconButton onClick={() => onClose(null)}>
                            <CloseRoundedIcon />
                        </IconButton>
                    </Box>
                }
            </DialogTitle>
            <Divider variant="middle" flexItem />
            <DialogContent sx={{ p: 0 }}>

                {activeStep === 0 && <StepOne defaultValue={insert} ref={setpRef} />}
                {activeStep === 1 && <StepTwo insert={insert} setInsert={setInsert} />}
                {activeStep === 2 && <StepThree accounts={insert.accounts ?? []} setAccounts={setInsert} />}

            </DialogContent>
            {isUpMd && <Divider variant="middle" flexItem />}
            <DialogActions>
                {isUpMd
                    ? <Box sx={{ display: "flex", justifyContent: "space-between", width: "100%", px: 3, py: 1 }}>
                        <Button
                            variant="outlined"
                            onClick={handleBack}
                            disabled={activeStep === 0}
                            startIcon={<KeyboardArrowLeftRoundedIcon />}
                        >
                            Back
                        </Button>
                        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
                            <Button
                                variant="outlined"
                                onClick={() => onClose(null)}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="contained"
                                onClick={handleNext}
                                disabled={activeStep === 2 && (insert.accounts ?? []).length === 0}
                                endIcon={<KeyboardArrowRightRoundedIcon />}
                                loading={loading}
                            >
                                {activeStep === 2 ? "Finish" : "Next"}
                            </Button>
                        </Box>
                    </Box>
                    : <MobileStepper
                        variant="progress"
                        steps={3}
                        activeStep={activeStep}
                        backButton={
                            <Button
                                onClick={handleBack}
                                disabled={activeStep === 0}
                                startIcon={<KeyboardArrowLeftRoundedIcon />}
                            >
                                Back
                            </Button>
                        }
                        nextButton={
                            <Button
                                onClick={handleNext}
                                disabled={activeStep === 2 && (insert.accounts ?? []).length === 0}
                                endIcon={<KeyboardArrowRightRoundedIcon />}
                                loading={loading}
                            >
                                {activeStep === 2 ? "Finish" : "Next"}
                            </Button>
                        }
                    />
                }
            </DialogActions>
        </Dialog>
    );
}