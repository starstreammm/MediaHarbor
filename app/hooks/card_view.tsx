import { Grid, Paper, Card } from "@mui/material";

import { type SetStateAction, type Dispatch, useEffect } from "react";


const gridSizes = [12, 6, 4, 3, 2];


function handleSizeIndex(index: number) {
    if (index < 0) return gridSizes[0];
    if (index >= gridSizes.length) return gridSizes[gridSizes.length - 1];
    return gridSizes[index];
};


function handleKeyboardShortcut(
    setSize: Dispatch<SetStateAction<number>>,
    setShowDetail?: Dispatch<SetStateAction<boolean>>,
) {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!e.altKey)
            return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSize((prev) => Math.min(prev + 1, 6));
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            setSize((prev) => Math.max(prev - 1, 0));
        }
        if (e.code === "KeyR") {
            e.preventDefault();
            setSize(3);
        }
        if (e.code === "KeyD") {
            e.preventDefault();
            setShowDetail?.((prev) => !prev);
        }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
}


export function GridCardContainer({ children, setSize, setShowDetail }: {
    children: React.ReactNode;
    setSize: Dispatch<SetStateAction<number>>;
    setShowDetail?: Dispatch<SetStateAction<boolean>>;
}) {
    useEffect(() => { return handleKeyboardShortcut(setSize, setShowDetail); }, []);

    return (
        <Grid
            container
            spacing={{ xs: 1, md: 1.8 }}
            sx={{
                width: "100%",
                p: { xs: 1, md: 1.8 },
                justifyContent: "flex-start",
                alignItems: "stretch",
            }}
        >
            {children}
        </Grid>
    );
}



export function GridCardItem({ children, size, onClick }: {
    children: React.ReactNode;
    size: number;
    onClick?: () => void;
}) {
    return (
        <Grid
            size={{
                xs: handleSizeIndex(size - 3),
                sm: handleSizeIndex(size - 2),
                md: handleSizeIndex(size - 1),
                lg: handleSizeIndex(size),
                xl: handleSizeIndex(size + 1),
            }}
            onClick={onClick}
            sx={{ cursor: "pointer" }}
        >
            <Paper elevation={3}>
                <Card>
                    {children}
                </Card>
            </Paper>
        </Grid>
    );
}