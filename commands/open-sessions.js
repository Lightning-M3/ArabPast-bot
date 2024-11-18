const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Attendance = require('../models/Attendance'); // تأكد من مسار النموذج
const logger = require('../utils/logger'); // تأكد من مسار السجل

module.exports = {
    data: new SlashCommandBuilder()
        .setName('open-sessions')
        .setDescription('عرض الأشخاص الذين لديهم جلسات حضور مفتوحة.'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guildId = interaction.guild.id;

        try {
            // البحث عن جميع سجلات الحضور المفتوحة
            const attendanceRecords = await Attendance.find({
                guildId: guildId,
                'sessions.checkOut': { $exists: false } // تحقق من وجود جلسات مفتوحة
            });

            if (attendanceRecords.length === 0) {
                return await interaction.followUp({
                    content: '❌ لا توجد جلسات حضور مفتوحة حاليًا.',
                    ephemeral: true
                });
            }

            // إعداد قائمة المستخدمين الذين لديهم جلسات مفتوحة
            const openSessions = attendanceRecords.map(record => {
                const user = interaction.guild.members.cache.get(record.userId);
                return user ? user.user.tag : 'مستخدم غير موجود';
            });

            // إعداد الرسالة
            const embed = new EmbedBuilder()
                .setTitle('🕒 الجلسات المفتوحة')
                .setDescription('الأشخاص الذين لديهم جلسات حضور مفتوحة:')
                .addFields({ name: 'الأعضاء', value: openSessions.join('\n') })
                .setColor(0x00ff00)
                .setTimestamp();

            await interaction.followUp({ embeds: [embed], ephemeral: true });

        } catch (error) {
            logger.error('Error in open-sessions command:', error);
            await interaction.followUp({
                content: 'حدث خطأ أثناء محاولة عرض الجلسات المفتوحة.',
                ephemeral: true
            });
        }
    }
}; 