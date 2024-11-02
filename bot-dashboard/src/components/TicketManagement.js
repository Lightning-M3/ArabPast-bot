import React, { useState, useEffect } from 'react';
import { 
  Paper, 
  Typography, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  CircularProgress,
  Alert,
  Box,
  Card,
  CardContent,
  Grid,
  Chip
} from '@mui/material';
import {
  ConfirmationNumber as TicketIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Today as TodayIcon
} from '@mui/icons-material';
import axios from 'axios';

function TicketManagement() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalTickets: 0,
    openTickets: 0,
    closedTickets: 0,
    todayTickets: 0
  });

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/tickets`);
      setTickets(response.data);

      // حساب الإحصائيات
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      setStats({
        totalTickets: response.data.length,
        openTickets: response.data.filter(t => t.status === 'open').length,
        closedTickets: response.data.filter(t => t.status === 'closed').length,
        todayTickets: response.data.filter(t => new Date(t.createdAt) >= today).length
      });

      setError(null);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      setError('فشل في جلب بيانات التذاكر');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
      <CircularProgress />
    </Box>
  );
  
  if (error) return (
    <Alert severity="error" sx={{ mt: 2 }}>
      {error}
    </Alert>
  );

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        إدارة التذاكر
      </Typography>

      {/* إحصائيات التذاكر */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <TicketIcon sx={{ mr: 1 }} />
                <Typography variant="h6">
                  إجمالي التذاكر
                </Typography>
              </Box>
              <Typography variant="h4">
                {stats.totalTickets}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <CheckCircleIcon sx={{ mr: 1, color: 'success.main' }} />
                <Typography variant="h6">
                  التذاكر المفتوحة
                </Typography>
              </Box>
              <Typography variant="h4">
                {stats.openTickets}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <CancelIcon sx={{ mr: 1, color: 'error.main' }} />
                <Typography variant="h6">
                  التذاكر المغلقة
                </Typography>
              </Box>
              <Typography variant="h4">
                {stats.closedTickets}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <TodayIcon sx={{ mr: 1 }} />
                <Typography variant="h6">
                  تذاكر اليوم
                </Typography>
              </Box>
              <Typography variant="h4">
                {stats.todayTickets}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* جدول التذاكر */}
      <Paper sx={{ p: 3 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>رقم التذكرة</TableCell>
                <TableCell>المستخدم</TableCell>
                <TableCell>الحالة</TableCell>
                <TableCell>تاريخ الإنشاء</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tickets.map((ticket) => (
                <TableRow key={ticket._id}>
                  <TableCell>{ticket.ticketId}</TableCell>
                  <TableCell>{ticket.userId}</TableCell>
                  <TableCell>
                    <Chip 
                      label={ticket.status === 'open' ? 'مفتوحة' : 'مغلقة'}
                      color={ticket.status === 'open' ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(ticket.createdAt).toLocaleDateString('ar-SA', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}

export default TicketManagement;
