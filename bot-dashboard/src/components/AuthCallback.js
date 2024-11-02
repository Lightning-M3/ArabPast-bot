import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircularProgress, Alert, Box, Button } from '@mui/material';
import axios from 'axios';

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        console.log('Auth Code:', code);

        if (!code) {
          setError('لم يتم العثور على رمز المصادقة');
          setLoading(false);
          return;
        }

        if (localStorage.getItem('auth_in_progress')) {
          return;
        }
        localStorage.setItem('auth_in_progress', 'true');

        try {
          const response = await axios.post(`${process.env.REACT_APP_API_URL}/auth/discord`, {
            code,
            redirect_uri: window.location.origin + '/auth/callback'
          });

          if (response.data.access_token) {
            localStorage.setItem('discord_token', response.data.access_token);
            localStorage.setItem('discord_user', JSON.stringify(response.data.user));
            localStorage.setItem('discord_guilds', JSON.stringify(response.data.guilds));
            navigate('/servers');
          } else {
            throw new Error('لم يتم استلام رمز الوصول');
          }
        } finally {
          localStorage.removeItem('auth_in_progress');
        }

      } catch (error) {
        console.error('Detailed Auth Error:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status
        });
        
        if (error.response?.data?.error === 'invalid_grant' && 
            localStorage.getItem('discord_token')) {
          navigate('/servers');
          return;
        }

        setError(error.response?.data?.error || 'فشل في عملية المصادقة');
        setLoading(false);
      }
    };

    handleCallback();
  }, [navigate]);

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        minHeight: '100vh',
        flexDirection: 'column',
        gap: 2
      }}>
        <CircularProgress />
        <div>جاري المصادقة...</div>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        minHeight: '100vh'
      }}>
        <Alert 
          severity="error" 
          sx={{ maxWidth: 400 }}
          action={
            <Button 
              color="inherit" 
              size="small" 
              onClick={() => navigate('/login')}
            >
              العودة لتسجيل الدخول
            </Button>
          }
        >
          {error}
        </Alert>
      </Box>
    );
  }

  return null;
}

export default AuthCallback; 