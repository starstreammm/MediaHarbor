import {
    Box,
    Paper,
    type SxProps,
    type Theme,
} from "@mui/material";

interface StageManagerProps {
    children: React.ReactNode;
    onClick?: () => void;
    sx?: SxProps<Theme>;
}

export function StageManager({
    children,
    sx,
}: StageManagerProps) {
    return (
        <Box
            sx={{
                position: "relative",

                display: "grid",
                gridTemplateColumns: "128px minmax(0, 1fr)",

                width: "100%",
                height: "100%",

                overflow: "hidden",

                ...sx,
            }}
        >
            {children}
        </Box>
    );
}


export function StageManagerList({
    children,
    sx,
}: StageManagerProps) {
    return (
        <Box
            sx={{
                position: "absolute",

                left: 8,
                top: "50%",

                width: 180,
                maxHeight: "calc(100% - 32px)",

                transform: "translateY(-50%)",

                zIndex: 20,

                // 提供 3D perspective
                perspective: "1000px",

                pointerEvents: "none",

                ...sx,
            }}
        >
            <Box
                sx={{
                    width: "100%",
                    height: "100%",

                    display: "flex",
                    flexDirection: "column",

                    gap: 1,
                    p: 1,

                    overflowY: "auto",
                    overflowX: "hidden",

                    scrollbarWidth: "none",

                    "&::-webkit-scrollbar": {
                        display: "none",
                    },

                    pointerEvents: "auto",

                    // 默认倾斜
                    transform: "rotateY(43deg)",

                    // 左侧 Y 轴
                    transformOrigin: "left center",

                    transition: `
                        transform
                        450ms cubic-bezier(.2,.8,.2,1)
                    `,

                    // Glass
                    background: `
                        linear-gradient(
                            135deg,
                            rgba(255,255,255,.20),
                            rgba(255,255,255,.08) 45%,
                            rgba(255,255,255,.025)
                        )
                    `,

                    backdropFilter: "blur(30px) saturate(140%)",
                    WebkitBackdropFilter:
                        "blur(30px) saturate(140%)",

                    border: "1px solid rgba(255,255,255,.14)",

                    borderRadius: 3,

                    boxShadow: `
                        0 20px 50px rgba(0,0,0,.30),
                        inset 0 1px 0 rgba(255,255,255,.15)
                    `,

                    "&:hover": {
                        transform: "rotateY(0deg)",
                    },

                    "& > *": {
                        position: "relative",
                    },
                }}
            >
                {children}
            </Box>
        </Box>
    );
}

export function StageManagerListItem({
    children,
    onClick,
    sx,
}: StageManagerProps) {
    return (
        <Paper
            elevation={0}
            onClick={(e) => {
                e.stopPropagation();
                onClick?.();
            }}
            sx={{
                width: "100%",
                aspectRatio: "4 / 3",

                flexShrink: 0,

                overflow: "hidden",

                borderRadius: 3,

                cursor: onClick
                    ? "pointer"
                    : "default",

                transition: `
                    transform 200ms ease,
                    opacity 200ms ease
                `,

                "&:hover": {
                    transform: onClick
                        ? "scale(1.03)"
                        : undefined,
                },

                ...sx,
            }}
        >
            {children}
        </Paper>
    );
}


export function StageManagerActive({
    children,
    sx,
}: StageManagerProps) {
    return (
        <Box
            sx={{
                gridColumn: 2,
                gridRow: 1,
                p: 1,
                ...sx,
            }}
        >
            <Paper
                elevation={8}
                sx={{
                    width: "100%",
                    height: "100%",

                    minWidth: 0,
                    minHeight: 0,

                    overflow: "hidden",

                    borderRadius: 4,
                }}
            >
                {children}
            </Paper>
        </Box>
    );
}