import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, 
  Typography, 
  Button, 
  Grid, 
  Card, 
  CardContent, 
  Alert, 
  CircularProgress,
  IconButton,
  Tooltip,
  TextField
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';

function ServerSettings() {
  const [settings, setSettings] = useState({
    messages: {
      checkInMessage: 'تم تسجيل حضورك بنجاح!',
      checkOutMessage: 'تم تسجيل انصرافك بنجاح!',
      ticketCreateMessage: 'تم إنشاء تذكرتك بنجاح!',
      ticketCloseMessage: 'تم إغلاق التذكرة بنجاح!'
    },
    attendance: {
      maxSessionsPerDay: 10,
      minSessionDuration: 1,
      workingHours: {
        start: '00:00',
        end: '23:59'
      },
      autoClose: true
    },
    botPresence: {
      nickname: '',
      avatar: '',
      about: ''
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const navigate = useNavigate();
  const { serverId } = useParams();

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/servers/${serverId}/settings`);
      if (response.data) {
        setSettings(response.data);
      }
      setError(null);
    } catch (error) {
      setError('فشل في جلب الإعدادات');
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleChange = (section, field, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!hasChanges) return;

    try {
      setSaving(true);
      await axios.post(`${process.env.REACT_APP_API_URL}/api/servers/${serverId}/settings`, settings);
      setSuccess(true);
      setError(null);
      setHasChanges(false);
    } catch (error) {
      setError('فشل في حفظ الإعدادات');
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    fetchSettings();
    setHasChanges(false);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton onClick={() => navigate('/servers')}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">
          إعدادات السيرفر
        </Typography>
        <Tooltip title="إعدادات البوت الخاصة بهذا السيرفر">
          <IconButton>
            <InfoIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                رسائل النظام
              </Typography>
              <TextField
                fullWidth
                label="رسالة تسجيل الحضور"
                value={settings.messages.checkInMessage}
                onChange={(e) => handleChange('messages', 'checkInMessage', e.target.value)}
                margin="normal"
              />
              <TextField
                fullWidth
                label="رسالة تسجيل الانصراف"
                value={settings.messages.checkOutMessage}
                onChange={(e) => handleChange('messages', 'checkOutMessage', e.target.value)}
                margin="normal"
              />
              <TextField
                fullWidth
                label="رسالة إنشاء التذكرة"
                value={settings.messages.ticketCreateMessage}
                onChange={(e) => handleChange('messages', 'ticketCreateMessage', e.target.value)}
                margin="normal"
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button
          variant="outlined"
          onClick={handleReset}
          startIcon={<RefreshIcon />}
          disabled={saving || !hasChanges}
        >
          إعادة تعيين
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
          disabled={saving || !hasChanges}
        >
          حفظ التغييرات
        </Button>
      </Box>

      {success && (
        <Alert severity="success" sx={{ mt: 2 }}>
          تم حفظ الإعدادات بنجاح
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}

export default ServerSettings; 