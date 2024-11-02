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
  AccessTime as AccessTimeIcon,
  Group as GroupIcon,
  DateRange as DateRangeIcon
} from '@mui/icons-material';
import axios from 'axios';

function AttendanceManagement() {
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalHours: 0,
    averageSessionDuration: 0
  });

  useEffect(() => {
    fetchAttendance();
  }, []);

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${process.env.REACT_APP_API_URL}/api/attendance`);
      setAttendance(response.data);
      
      // حساب الإحصائيات
      const uniqueUsers = new Set(response.data.map(record => record.userId));
      const totalMinutes = response.data.reduce((acc, record) => acc + (record.totalHours * 60 + record.totalMinutes), 0);
      const totalSessions = response.data.reduce((acc, record) => acc + record.sessions.length, 0);
      
      setStats({
        totalUsers: uniqueUsers.size,
        totalHours: Math.floor(totalMinutes / 60),
        averageSessionDuration: totalSessions ? Math.floor(totalMinutes / totalSessions) : 0
      });

      setError(null);
    } catch (error) {
      console.error('Error fetching attendance:', error);
      setError('فشل في جلب بيانات الحضور');
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
        إدارة الحضور
      </Typography>

      {/* إحصائيات عامة */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <GroupIcon sx={{ mr: 1 }} />
                <Typography variant="h6">
                  المستخدمين النشطين
                </Typography>
              </Box>
              <Typography variant="h4">
                {stats.totalUsers}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <AccessTimeIcon sx={{ mr: 1 }} />
                <Typography variant="h6">
                  إجمالي ساعات العمل
                </Typography>
              </Box>
              <Typography variant="h4">
                {stats.totalHours}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <DateRangeIcon sx={{ mr: 1 }} />
                <Typography variant="h6">
                  متوسط مدة الجلسة
                </Typography>
              </Box>
              <Typography variant="h4">
                {Math.floor(stats.averageSessionDuration / 60)}:{(stats.averageSessionDuration % 60).toString().padStart(2, '0')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* جدول السجلات */}
      <Paper sx={{ p: 3 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>المستخدم</TableCell>
                <TableCell>التاريخ</TableCell>
                <TableCell>عدد الجلسات</TableCell>
                <TableCell>إجمالي الوقت</TableCell>
                <TableCell>الحالة</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {attendance.map((record) => (
                <TableRow key={record._id}>
                  <TableCell>{record.userId}</TableCell>
                  <TableCell>
                    {new Date(record.date).toLocaleDateString('ar-SA', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit'
                    })}
                  </TableCell>
                  <TableCell>{record.sessions.length}</TableCell>
                  <TableCell>
                    {`${record.totalHours}:${record.totalMinutes.toString().padStart(2, '0')}`}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={record.sessions[record.sessions.length - 1]?.checkOut ? "منصرف" : "حاضر"}
                      color={record.sessions[record.sessions.length - 1]?.checkOut ? "default" : "success"}
                      size="small"
                    />
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

export default AttendanceManagement;
