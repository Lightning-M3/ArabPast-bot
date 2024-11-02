import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { 
  Box, 
  Drawer, 
  AppBar, 
  Toolbar, 
  List, 
  ListItem, 
  ListItemIcon, 
  ListItemText,
  Typography,
  IconButton,
  Avatar,
  Divider,
  ThemeProvider,
  createTheme,
  CssBaseline,
  StyledEngineProvider
} from '@mui/material';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import {
  Dashboard as DashboardIcon,
  Settings as SettingsIcon,
  ConfirmationNumber as TicketIcon,
  AccessTime as TimeIcon,
  Logout as LogoutIcon
} from '@mui/icons-material';

// المكونات
import Login from './components/Login';
import AuthCallback from './components/AuthCallback';
import ServerSelect from './components/ServerSelect';
import TicketManagement from './components/TicketManagement';
import AttendanceManagement from './components/AttendanceManagement';
import ServerSettings from './components/ServerSettings';
import ConnectionStatus from './components/ConnectionStatus';

const drawerWidth = 240;

// إنشاء كاش للـ RTL
const cacheRtl = createCache({
  key: 'muirtl',
  stylisPlugins: [prefixer, rtlPlugin],
  prepend: true,
});

// تحديث الثيم
const darkTheme = createTheme({
  direction: 'rtl',
  palette: {
    mode: 'dark',
    primary: {
      main: '#7289da',
    },
    background: {
      default: '#36393f',
      paper: '#2f3136',
    },
  },
  typography: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    allVariants: {
      textAlign: 'right',
    },
  },
  components: {
    MuiTextField: {
      defaultProps: {
        dir: 'rtl',
      },
    },
    MuiInputBase: {
      styleOverrides: {
        input: {
          textAlign: 'right',
        },
      },
    },
  },
});

// مكون PrivateRoute للتحقق من تسجيل الدخول
const PrivateRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('discord_token');
  return isAuthenticated ? children : <Navigate to="/login" />;
};

function DashboardLayout({ children }) {
  const user = JSON.parse(localStorage.getItem('discord_user') || '{}');
  const currentServer = JSON.parse(localStorage.getItem('current_server') || '{}');

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/login';
  };

  return (
    <Box sx={{ display: 'flex', direction: 'rtl' }}>
      <AppBar 
        position="fixed" 
        sx={{ 
          width: `calc(100% - ${drawerWidth}px)`,
          mr: `${drawerWidth}px`
        }}
      >
        <Toolbar>
          <Avatar 
            src={currentServer.icon ? 
              `https://cdn.discordapp.com/icons/${currentServer.id}/${currentServer.icon}.png` : 
              '/default-server-icon.png'
            }
            sx={{ ml: 2 }}
          />
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {currentServer.name || 'لوحة التحكم'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2">
              {user.username}
            </Typography>
            <Avatar 
              src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
              alt={user.username}
            />
            <IconButton color="inherit" onClick={handleLogout}>
              <LogoutIcon />
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        anchor="right"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            backgroundColor: '#2f3136',
            borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            <ListItem 
              button 
              component={Link} 
              to="/servers"
              sx={{
                '&:hover': {
                  backgroundColor: 'rgba(114, 137, 218, 0.1)',
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                <DashboardIcon />
              </ListItemIcon>
              <ListItemText 
                primary="السيرفرات" 
                primaryTypographyProps={{
                  fontSize: '0.95rem',
                  fontWeight: 500
                }}
              />
            </ListItem>
            <Divider sx={{ my: 1 }} />
            {currentServer.id && (
              <>
                <ListItem 
                  button 
                  component={Link} 
                  to={`/server/${currentServer.id}/attendance`}
                  sx={{
                    '&:hover': {
                      backgroundColor: 'rgba(114, 137, 218, 0.1)',
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <TimeIcon />
                  </ListItemIcon>
                  <ListItemText 
                    primary="نظام الحضور"
                    primaryTypographyProps={{
                      fontSize: '0.95rem',
                      fontWeight: 500
                    }}
                  />
                </ListItem>
                <ListItem 
                  button 
                  component={Link} 
                  to={`/server/${currentServer.id}/tickets`}
                  sx={{
                    '&:hover': {
                      backgroundColor: 'rgba(114, 137, 218, 0.1)',
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <TicketIcon />
                  </ListItemIcon>
                  <ListItemText 
                    primary="نظام التذاكر"
                    primaryTypographyProps={{
                      fontSize: '0.95rem',
                      fontWeight: 500
                    }}
                  />
                </ListItem>
                <ListItem 
                  button 
                  component={Link} 
                  to={`/server/${currentServer.id}/settings`}
                  sx={{
                    '&:hover': {
                      backgroundColor: 'rgba(114, 137, 218, 0.1)',
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <SettingsIcon />
                  </ListItemIcon>
                  <ListItemText 
                    primary="الإعدادات"
                    primaryTypographyProps={{
                      fontSize: '0.95rem',
                      fontWeight: 500
                    }}
                  />
                </ListItem>
              </>
            )}
          </List>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}

function App() {
  return (
    <CacheProvider value={cacheRtl}>
      <StyledEngineProvider injectFirst>
        <ThemeProvider theme={darkTheme}>
          <CssBaseline />
          <Router>
            <ConnectionStatus />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/servers" element={
                <PrivateRoute>
                  <DashboardLayout>
                    <ServerSelect />
                  </DashboardLayout>
                </PrivateRoute>
              } />
              <Route path="/server/:serverId/*" element={
                <PrivateRoute>
                  <DashboardLayout>
                    <Routes>
                      <Route path="tickets" element={<TicketManagement />} />
                      <Route path="attendance" element={<AttendanceManagement />} />
                      <Route path="settings" element={<ServerSettings />} />
                    </Routes>
                  </DashboardLayout>
                </PrivateRoute>
              } />
              <Route path="/" element={<Navigate to="/login" />} />
            </Routes>
          </Router>
        </ThemeProvider>
      </StyledEngineProvider>
    </CacheProvider>
  );
}

export default App;
