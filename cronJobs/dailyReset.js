const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');

// دالة لإرسال التقرير اليومي
async function sendDailyReport(guild) {
  try {
    const logChannel = guild.channels.cache.find(c => c.name === 'سجل-الحضور');
    if (!logChannel) return;

    const Attendance = require('../models/Attendance');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const records = await Attendance.find({
      guildId: guild.id,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    });

    if (records.length === 0) {
      await logChannel.send({
        embeds: [{
          title: '📊 التقرير اليومي للحضور',
          description: `لا توجد سجلات حضور ليوم ${today.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })}`,
          color: 0xffff00,
          timestamp: new Date()
        }]
      });
      return;
    }

    let reportText = '';
    let totalMinutes = 0;
    let earliestCheckIn = null;
    let latestCheckOut = null;
    let totalSessions = 0;
    const userStats = new Map();

    // تجميع إحصائيات كل مستخدم
    for (const record of records) {
      const member = await guild.members.fetch(record.userId).catch(() => null);
      if (!member) continue;

      let userTotal = 0;
      let userSessions = 0;
      let userEarliestCheckIn = null;
      let userLatestCheckOut = null;

      for (const session of record.sessions) {
        if (session.checkIn && session.checkOut) {
          const duration = Math.floor((session.checkOut - session.checkIn) / 1000 / 60);
          userTotal += duration;
          userSessions++;
          totalSessions++;

          if (!userEarliestCheckIn || session.checkIn < userEarliestCheckIn) {
            userEarliestCheckIn = session.checkIn;
          }
          if (!userLatestCheckOut || session.checkOut > userLatestCheckOut) {
            userLatestCheckOut = session.checkOut;
          }
          if (!earliestCheckIn || session.checkIn < earliestCheckIn) {
            earliestCheckIn = session.checkIn;
          }
          if (!latestCheckOut || session.checkOut > latestCheckOut) {
            latestCheckOut = session.checkOut;
          }
        }
      }

      totalMinutes += userTotal;
      userStats.set(member.id, {
        username: member.user.username,
        totalMinutes: userTotal,
        sessions: userSessions,
        earliestCheckIn: userEarliestCheckIn,
        latestCheckOut: userLatestCheckOut
      });
    }

    // ترتيب المستخدمين حسب الوقت الإجمالي
    const sortedUsers = Array.from(userStats.entries())
      .sort(([, a], [, b]) => b.totalMinutes - a.totalMinutes);

    reportText = sortedUsers.map(([, stats], index) => {
      const hours = Math.floor(stats.totalMinutes / 60);
      const minutes = stats.totalMinutes % 60;
      return `**${index + 1}.** ${stats.username}\n` +
             `⏰ المدة: ${hours}:${minutes.toString().padStart(2, '0')} ساعة\n` +
             `📊 عدد الجلسات: ${stats.sessions}\n` +
             `🕐 أول حضور: ${stats.earliestCheckIn.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}\n` +
             `🕐 آخر انصراف: ${stats.latestCheckOut.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}\n`;
    }).join('\n');

    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    await logChannel.send({
      embeds: [{
        title: '📊 التقرير اليومي للحضور',
        description: `تقرير يوم ${today.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        })}`,
        fields: [
          {
            name: '📈 إحصائيات عامة',
            value: 
              `👥 إجمالي الحضور: ${records.length} عضو\n` +
              `⏱️ إجمالي ساعات العمل: ${totalHours}:${remainingMinutes.toString().padStart(2, '0')} ساعة\n` +
              `🔄 إجمالي الجلسات: ${totalSessions}\n` +
              `⏰ أول حضور: ${earliestCheckIn.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}\n` +
              `⏰ آخر انصراف: ${latestCheckOut.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })}`
          },
          {
            name: '👤 تفاصيل الأعضاء',
            value: reportText || 'لا يوجد سجلات'
          }
        ],
        color: 0x00ff00,
        timestamp: new Date(),
        footer: {
          text: 'تم إنشاء التقرير في'
        }
      }]
    });
  } catch (error) {
    console.error('Error sending daily report:', error);
  }
}

// دالة إعداد المهام اليومية
function setupDailyReset(client) {
  cron.schedule('59 23 * * *', async () => {
    console.log('Starting automatic check-out and daily report...');
    
    for (const guild of client.guilds.cache.values()) {
      try {
        await sendDailyReport(guild);
      } catch (error) {
        console.error(`Error processing daily tasks for guild ${guild.name}:`, error);
      }
    }
  }, {
    timezone: 'Asia/Riyadh'
  });
}

module.exports = {
  setupDailyReset,
  sendDailyReport
}; 