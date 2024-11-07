const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const Attendance = require('../models/Attendance');

// دالة لفرض تسجيل الانصراف
async function forceCheckOutAll(guild) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // البحث عن جميع سجلات الحضور اليوم
    const records = await Attendance.find({
      guildId: guild.id,
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    });

    const logChannel = guild.channels.cache.find(c => c.name === 'سجل-الحضور');
    const now = new Date();
    let checkedOutCount = 0;

    for (const record of records) {
      let updated = false;
      
      // البحث عن الجلسات المفتوحة
      for (const session of record.sessions) {
        if (session.checkIn && !session.checkOut) {
          session.checkOut = now;
          const duration = Math.floor((session.checkOut - session.checkIn) / 1000 / 60);
          session.duration = duration;
          updated = true;
        }
      }

      if (updated) {
        await record.save();
        checkedOutCount++;

        // إزالة رتبة "مسجل حضوره"
        const member = await guild.members.fetch(record.userId).catch(() => null);
        if (member) {
          const attendanceRole = guild.roles.cache.find(role => role.name === 'مسجل حضوره');
          if (attendanceRole && member.roles.cache.has(attendanceRole.id)) {
            await member.roles.remove(attendanceRole);
          }

          // تسجيل في قناة السجلات
          if (logChannel) {
            const lastSession = record.sessions[record.sessions.length - 1];
            const hours = Math.floor(lastSession.duration / 60);
            const minutes = lastSession.duration % 60;

            await logChannel.send({
              embeds: [{
                title: '⚠️ تسجيل انصراف تلقائي',
                description: `تم تسجيل انصراف تلقائي للعضو ${member}`,
                fields: [
                  {
                    name: 'وقت الحضور',
                    value: lastSession.checkIn.toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                      timeZone: 'Asia/Riyadh'
                    })
                  },
                  {
                    name: 'وقت الانصراف',
                    value: now.toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                      timeZone: 'Asia/Riyadh'
                    })
                  },
                  {
                    name: 'مدة الجلسة',
                    value: `${hours} ساعة و ${minutes} دقيقة`
                  }
                ],
                color: 0xffa500,
                timestamp: new Date()
              }]
            });
          }
        }
      }
    }

    if (logChannel && checkedOutCount > 0) {
      await logChannel.send({
        embeds: [{
          title: '📋 ملخص الانصراف التلقائي',
          description: `تم تسجيل انصراف ${checkedOutCount} عضو بشكل تلقائي`,
          color: 0x00ff00,
          timestamp: new Date()
        }]
      });
    }

  } catch (error) {
    logger.error('Error in forceCheckOutAll:', error);
  }
}

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

      if (userSessions > 0) {
        totalMinutes += userTotal;
        userStats.set(member.id, {
          displayName: member.displayName,
          totalMinutes: userTotal,
          sessions: userSessions,
          earliestCheckIn: userEarliestCheckIn,
          latestCheckOut: userLatestCheckOut
        });
      }
    }

    // تنسيق التقرير
    const sortedUsers = Array.from(userStats.entries())
      .sort(([, a], [, b]) => b.totalMinutes - a.totalMinutes);

    reportText = sortedUsers.map(([, stats]) => {
      const hours = Math.floor(stats.totalMinutes / 60);
      const minutes = stats.totalMinutes % 60;
      return `**${stats.displayName}**\n` +
             `⏰ المدة: ${hours}:${minutes.toString().padStart(2, '0')} ساعة\n` +
             `📊 عدد الجلسات: ${stats.sessions}\n` +
             `🕐 أول حضور: ${stats.earliestCheckIn?.toLocaleTimeString('en-GB', { 
               hour: '2-digit', 
               minute: '2-digit', 
               hour12: true 
             }) || 'غير متوفر'}\n` +
             `🕐 آخر انصراف: ${stats.latestCheckOut?.toLocaleTimeString('en-GB', { 
               hour: '2-digit', 
               minute: '2-digit', 
               hour12: true 
             }) || 'غير متوفر'}\n`;
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

// تحديث دالة setupDailyReset
function setupDailyReset(client) {
  // تسجيل انصراف تلقائي في 11:58 مساءً
  cron.schedule('58 23 * * *', async () => {
    logger.info('Starting automatic check-out...');
    for (const guild of client.guilds.cache.values()) {
      try {
        await forceCheckOutAll(guild);
      } catch (error) {
        logger.error(`Error processing automatic check-out for guild ${guild.name}:`, error);
      }
    }
  }, {
    timezone: 'Asia/Riyadh'
  });

  // التقرير اليومي في 11:59 مساءً
  cron.schedule('59 23 * * *', async () => {
    logger.info('Starting daily attendance report...');
    for (const guild of client.guilds.cache.values()) {
      try {
        await sendDailyReport(guild);
      } catch (error) {
        logger.error(`Error sending daily report for guild ${guild.name}:`, error);
      }
    }
  }, {
    timezone: 'Asia/Riyadh'
  });
}

module.exports = {
  setupDailyReset,
  forceCheckOutAll
}; 
