import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Typography, 
  Grid, 
  Card, 
  CardContent, 
  CardMedia, 
  Button,
  Stack,
  Box,
  CircularProgress,
  Alert,
  Tooltip,
  IconButton
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { 
  Settings as SettingsIcon,
  AccessTime as TimeIcon,
  ConfirmationNumber as TicketIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import axios from 'axios';

function ServerSelect() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mutualGuilds, setMutualGuilds] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMutualGuilds = async () => {
      try {
        // جلب السيرفرات التي يوجد فيها البوت
        const botResponse = await axios.get(`${process.env.REACT_APP_API_URL}/api/bot/guilds`);
        const botGuilds = new Set(botResponse.data.map(guild => guild.id));

        // جلب سيرفرات المستخدم من localStorage
        const userGuilds = JSON.parse(localStorage.getItem('discord_guilds') || '[]');

        // تصفية السيرفرات المشتركة مع التحقق من الصلاحيات
        const mutual = userGuilds.filter(guild => 
          botGuilds.has(guild.id) && 
          (guild.permissions & 0x8) === 0x8 // التحقق من صلاحية Administrator
        );

        setMutualGuilds(mutual);
        setError(null);
      } catch (error) {
        console.error('Error fetching guilds:', error);
        setError('فشل في جلب السيرفرات');
      } finally {
        setLoading(false);
      }
    };

    fetchMutualGuilds();
  }, []);

  const handleServerSelect = (guild) => {
    // حفظ معلومات السيرفر المحدد
    localStorage.setItem('current_server', JSON.stringify(guild));
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 4 }}>
        {error}
      </Alert>
    );
  }

  if (!mutualGuilds || mutualGuilds.length === 0) {
    return (
      <Alert severity="info" sx={{ mt: 4 }}>
        لم يتم العثور على أي سيرفر يحتوي على البوت مع صلاحيات الإدارة.
        <Button 
          href={`https://discord.com/api/oauth2/authorize?client_id=${process.env.REACT_APP_DISCORD_CLIENT_ID}&permissions=8&scope=bot`}
          target="_blank"
          sx={{ ml: 2 }}
        >
          أضف البوت إلى سيرفرك
        </Button>
      </Alert>
    );
  }

  return (
    <Container>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          اختر السيرفر
        </Typography>
        <Tooltip title="يجب أن تكون مشرفاً في السيرفر للوصول إلى الإعدادات">
          <IconButton>
            <InfoIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Grid container spacing={3}>
        {mutualGuilds.map(guild => (
          <Grid item xs={12} sm={6} md={4} key={guild.id}>
            <Card>
              <CardMedia
                component="img"
                height="140"
                image={guild.icon ? 
                  `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : 
                  '/default-server-icon.png'
                }
                alt={guild.name}
                onError={(e) => {
                  e.target.src = '/default-server-icon.png';
                }}
              />
              <CardContent>
                <Typography gutterBottom variant="h5">
                  {guild.name}
                </Typography>
                <Stack spacing={1.5} sx={{ mt: 2 }}>
                  <Button 
                    variant="contained"
                    startIcon={<SettingsIcon />}
                    onClick={() => {
                      handleServerSelect(guild);
                      navigate(`/server/${guild.id}/settings`);
                    }}
                    fullWidth
                  >
                    الإعدادات
                  </Button>
                  <Button 
                    variant="outlined"
                    startIcon={<TimeIcon />}
                    onClick={() => {
                      handleServerSelect(guild);
                      navigate(`/server/${guild.id}/attendance`);
                    }}
                    fullWidth
                  >
                    سجل الحضور
                  </Button>
                  <Button 
                    variant="outlined"
                    startIcon={<TicketIcon />}
                    onClick={() => {
                      handleServerSelect(guild);
                      navigate(`/server/${guild.id}/tickets`);
                    }}
                    fullWidth
                  >
                    التذاكر
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}

export default ServerSelect;