const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const Attendance = require('../models/Attendance');

// تنسيق موحد للتاريخ والوقت
const dateFormat = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Riyadh'
};

const timeFormat = {
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Riyadh'
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('admin-data')
    .setDescription('عرض بيانات الحضور للمستخدم المحدد خلال آخر 30 يوم')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('المستخدم المستهدف')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      const targetUser = interaction.options.getUser('user');
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const attendanceRecords = await Attendance.find({
        userId: targetUser.id,
        guildId: interaction.guildId,
        date: {
          $gte: thirtyDaysAgo
        }
      }).sort({ date: -1 });

      if (attendanceRecords.length === 0) {
        return await interaction.reply({
          content: `لا توجد سجلات حضور لـ ${targetUser.username} خلال آخر 30 يوم`,
          ephemeral: true
        });
      }

      // حساب الإحصائيات
      let totalMinutes = 0;
      let daysAttended = 0;
      let totalSessions = 0;
      let longestSession = 0;
      let shortestSession = Infinity;
      const dailyDetails = [];
      let lastWeekMinutes = 0;
      const lastWeekDate = new Date();
      lastWeekDate.setDate(lastWeekDate.getDate() - 7);

      attendanceRecords.forEach(record => {
        let dailyMinutes = 0;
        record.sessions.forEach(session => {
          if (session.checkOut) {
            dailyMinutes += session.duration;
            totalSessions++;
            longestSession = Math.max(longestSession, session.duration);
            shortestSession = Math.min(shortestSession, session.duration);
          }
        });
        
        if (dailyMinutes > 0) {
          totalMinutes += dailyMinutes;
          if (record.date >= lastWeekDate) {
            lastWeekMinutes += dailyMinutes;
          }
          daysAttended++;
          dailyDetails.push({
            date: record.date.toLocaleDateString('en-US', dateFormat).replace(/(\d+)\/(\d+)\/(\d+)/, '$2/$1/$3'),
            hours: Math.floor(dailyMinutes / 60),
            minutes: dailyMinutes % 60,
            sessions: record.sessions.length
          });
        }
      });

      const totalHours = Math.floor(totalMinutes / 60);
      const remainingMinutes = totalMinutes % 60;
      const averageDaily = totalMinutes / daysAttended;
      const averageSession = totalMinutes / totalSessions;
      const lastWeekHours = Math.floor(lastWeekMinutes / 60);
      const lastWeekRemainingMinutes = lastWeekMinutes % 60;

      // إنشاء Embed
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`📊 تقرير الحضور | ${targetUser.username}`)
        .setThumbnail(targetUser.displayAvatarURL())
        .setDescription(`تقرير تفصيلي لآخر 30 يوم`)
        .addFields(
          { 
            name: '⏰ إحصائيات الوقت',
            value: [
              `• إجمالي وقت العمل: **${totalHours}:${remainingMinutes.toString().padStart(2, '0')}** ساعة`,
              `• متوسط الوقت اليومي: **${Math.floor(averageDaily / 60)}:${Math.floor(averageDaily % 60).toString().padStart(2, '0')}** ساعة`,
              `• وقت العمل (آخر 7 أيام): **${lastWeekHours}:${lastWeekRemainingMinutes.toString().padStart(2, '0')}** ساعة`
            ].join('\n')
          },
          {
            name: '📅 إحصائيات الحضور',
            value: [
              `• أيام الحضور: **${daysAttended}** يوم`,
              `• عدد الجلسات: **${totalSessions}** جلسة`,
              `• نسبة الحضور: **${Math.round((daysAttended / 30) * 100)}%**`
            ].join('\n')
          },
          {
            name: '⚡ إحصائيات الجلسات',
            value: [
              `• متوسط مدة الجلسة: **${Math.floor(averageSession / 60)}:${Math.floor(averageSession % 60).toString().padStart(2, '0')}** ساعة`,
              `• أطول جلسة: **${Math.floor(longestSession / 60)}:${(longestSession % 60).toString().padStart(2, '0')}** ساعة`,
              `• أقصر جلسة: **${Math.floor(shortestSession / 60)}:${(shortestSession % 60).toString().padStart(2, '0')}** ساعة`
            ].join('\n')
          }
        )
        .setTimestamp()
        .setFooter({ 
          text: `طلب بواسطة ${interaction.user.username}`, 
          iconURL: interaction.user.displayAvatarURL() 
        });

      // إضافة تفاصيل آخر 5 أيام
      if (dailyDetails.length > 0) {
        let recentDays = dailyDetails.slice(0, 5).map(day => 
          `• ${day.date}: **${day.hours}:${day.minutes.toString().padStart(2, '0')}** ساعة (${day.sessions} جلسات)`
        ).join('\n');
        
        embed.addFields({
          name: '📋 آخر 5 أيام',
          value: recentDays
        });
      }

      await interaction.reply({
        embeds: [embed],
        ephemeral: false
      });

    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: 'حدث خطأ أثناء جلب البيانات',
        ephemeral: true
      });
    }
  },
};