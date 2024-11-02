import React from 'react';
import { Button, Box, Typography, Paper } from '@mui/material';
import { Login as LoginIcon } from '@mui/icons-material';

function Login() {
  const handleLogin = () => {
    try {
      const DISCORD_CLIENT_ID = process.env.REACT_APP_DISCORD_CLIENT_ID;
      console.log('Client ID:', DISCORD_CLIENT_ID);

      const REDIRECT_URI = 'http://localhost:3000/auth/callback';
      const SCOPES = ['identify', 'guilds'].join(' ');

      const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPES)}`;
      
      console.log('Auth URL:', authUrl);

      window.location.href = authUrl;
    } catch (error) {
      console.error('Error in handleLogin:', error);
    }
  };

  return (
    <Box sx={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(45deg, #23272A 30%, #2C2F33 90%)'
    }}>
      <Paper elevation={3} sx={{
        p: 4,
        maxWidth: 400,
        width: '90%',
        textAlign: 'center',
        background: '#36393F',
        borderRadius: 2
      }}>
        <Box sx={{ mb: 4 }}>
          <img 
            src="/bot-logo.png" 
            alt="Bot Logo" 
            style={{ width: 120, height: 120, borderRadius: '50%' }}
          />
        </Box>
        <Typography variant="h4" gutterBottom sx={{ color: '#fff' }}>
          مرحباً بك
        </Typography>
        <Typography variant="body1" sx={{ mb: 4, color: '#B9BBBE' }}>
          قم بتسجيل الدخول للوصول إلى لوحة التحكم
        </Typography>
        <Button 
          variant="contained"
          size="large"
          onClick={handleLogin}
          startIcon={<LoginIcon />}
          sx={{
            backgroundColor: '#7289DA',
            '&:hover': {
              backgroundColor: '#677BC4'
            },
            borderRadius: 3,
            py: 1.5,
            px: 4
          }}
        >
          تسجيل الدخول باستخدام Discord
        </Button>
      </Paper>
    </Box>
  );
}

export default Login; 