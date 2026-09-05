import {
    Box,
    Divider,
    IconButton,
    Typography,
    useTheme,
} from "@mui/material";
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';


export default function AppBar({ mobilDrawer, label, button }: { mobilDrawer: () => void, label: string, button?: React.ReactNode }) {
    const theme = useTheme();
    return (
        <>
            <Box sx={{
                position: { xs: "relative", md: "static" },
                display: 'flex',
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: 0,
                bgcolor: theme.vars?.palette.background.default,
                px: { xs: 1, md: 3 },
                height: { xs: 60, md: 80 },
                flexShrink: 0,
            }}>
                <IconButton
                    sx={{ display: { xs: 'flex', md: 'none' }, borderRadius: '18%' }}
                    onClick={mobilDrawer}
                >
                    <MenuRoundedIcon />
                </IconButton>
                <Typography sx={{
                    position: { xs: "absolute", md: "static" },
                    left: { xs: "50%", md: "auto" },
                    transform: { xs: "translateX(-50%)", md: "none" },
                    fontWeight: 'bold',
                    ml: { xs: 0, md: 1 },
                    color: theme.vars?.palette.secondary.dark,
                    fontSize: {
                        xs: theme.typography.h5.fontSize,
                        md: theme.typography.h4.fontSize
                    }
                }}>
                    {label}
                </Typography>
                <Box sx={{ ml: { xs: "auto", md: undefined } }}>
                    {button}
                </Box>
            </Box>

            <Divider variant="middle" flexItem />
        </>
    )
}