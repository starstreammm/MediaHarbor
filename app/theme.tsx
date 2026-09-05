import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: 'class'
  },
  colorSchemes: {
    light: {
      palette: {
        primary: {
          main: '#81D8D0',
          light: '#33FFD6',
          dark: '#4176B0',
        },
        secondary: {
          main: '#FF69B4',
          light: '#F8CDCD',
          dark: '#DD727D',
        },
        background: {
          default: '#F1F0EC',
          paper: '#F5F7F6',
        },
        success: {
          main: '#75CB5D',
          light: '#8EFF36',
          dark: '#00A466',
        },
      },
    },
    dark: {
      palette: {
        primary: {
          main: '#F8CDCD',
          light: '#F4F7FF',
          dark: '#B067A1',
        },
        secondary: {
          main: '#FFC196',
          light: '#FFF7E3',
          dark: '#D09F64',
        },
        background: {
          default: '#505557',
          paper: '#3D4040',
        },
        success: {
          main: '#75CB5D',
          light: '#8EFF36',
          dark: '#00A466',
        },
      },
    },
  },
  components: {
    MuiListItemButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          "&.Mui-selected": {
            backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.55)`,
            "&:hover": {
              backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.9)`,
            },
          },
        }),
      },
    },
  },
});