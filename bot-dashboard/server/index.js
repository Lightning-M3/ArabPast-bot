const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const logger = require('./utils/logger');
const axios = require('axios');
require('dotenv').config();

const app = express();

// تحسين إعدادات CORS
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? 'https://your-production-domain.com' 
    : 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

// مسار المصادقة
app.post('/auth/discord', async (req, res) => {
  try {
    const { code, redirect_uri } = req.body;
    
    // الحصول على التوكن من Discord
    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', 
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri,
        scope: 'identify guilds'
      }), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const access_token = tokenResponse.data.access_token;

    // الحصول على معلومات المستخدم
    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    // الحصول على السيرفرات
    const guildsResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    // إرجاع البيانات
    res.json({
      access_token,
      user: userResponse.data,
      guilds: guildsResponse.data
    });

  } catch (error) {
    console.error('Auth error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'فشل في عملية المصادقة',
      details: error.response?.data || error.message
    });
  }
});

// API routes للتذاكر
app.get('/api/tickets', async (req, res) => {
  try {
    const Ticket = require('../../models/Ticket');
    const tickets = await Ticket.find().sort({ createdAt: -1 });
    
    // تنسيق البيانات قبل إرسالها
    const formattedTickets = tickets.map(ticket => ({
      ...ticket.toObject(),
      createdAt: new Date(ticket.createdAt).toLocaleString('ar-SA'),
      status: ticket.status === 'open' ? 'مفتوحة' : 'مغلقة'
    }));
    
    res.json(formattedTickets);
  } catch (error) {
    logger.error('Error fetching tickets:', error);
    res.status(500).json({ 
      error: 'فشل في جلب بيانات التذاكر',
      details: error.message 
    });
  }
});

// API routes للحضور
app.get('/api/attendance', async (req, res) => {
  try {
    const Attendance = require('../../models/Attendance');
    const attendance = await Attendance.find()
      .sort({ date: -1 })
      .limit(100); // تحديد عدد السجلات المجلوبة
    
    // تنسيق البيانات قبل إرسالها
    const formattedAttendance = attendance.map(record => ({
      ...record.toObject(),
      date: new Date(record.date).toLocaleDateString('ar-SA'),
      totalTime: `${record.totalHours}:${record.totalMinutes.toString().padStart(2, '0')}`
    }));
    
    res.json(formattedAttendance);
  } catch (error) {
    logger.error('Error fetching attendance:', error);
    res.status(500).json({ 
      error: 'فشل في جلب بيانات الحضور',
      details: error.message 
    });
  }
});

// إضافة معالجة الأخطاء العامة
app.use((err, req, res, next) => {
  logger.error('Server error:', err);
  res.status(500).json({ 
    error: 'حدث خطأ في السيرفر',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  console.log(`Server running on port ${PORT}`);
});