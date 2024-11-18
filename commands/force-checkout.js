const { SlashCommandBuilder } = require('discord.js');
const Attendance = require('../models/Attendance'); // تأكد من مسار النموذج
const logger = require('../utils/logger'); // تأكد من مسار السجل

module.exports = {
    data: new SlashCommandBuilder()
        .setName('force-checkout')
        .setDescription('فرض تسجيل انصراف للمستخدم المحدد.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('المستخدم الذي تريد تسجيل انصرافه')
                .setRequired(true)),
    async execute(interaction) {
        // التحقق من صلاحيات المستخدم
        if (!interaction.member.permissions.has('MANAGE_ROLES')) {
            return await interaction.reply({
                content: '❌ ليس لديك صلاحية كافية لاستخدام هذا الأمر.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const user = interaction.options.getUser('user');
        const guildId = interaction.guild.id;

        try {
            // البحث عن سجل الحضور للمستخدم
            const attendanceRecord = await Attendance.findOne({
                userId: user.id,
                guildId: guildId,
                date: {
                    $gte: new Date(new Date().setHours(0, 0, 0, 0)),
                    $lt: new Date(new Date().setHours(23, 59, 59, 999))
                }
            });

            if (!attendanceRecord) {
                return await interaction.followUp({
                    content: `❌ لم يتم العثور على سجل حضور للمستخدم ${user.tag} اليوم.`,
                    ephemeral: true
                });
            }

            // التحقق من وجود جلسة مفتوحة
            const openSession = attendanceRecord.sessions.find(session => !session.checkOut);
            if (!openSession) {
                return await interaction.followUp({
                    content: `❌ لا توجد جلسة مفتوحة لتسجيل انصراف ${user.tag}.`,
                    ephemeral: true
                });
            }

            // تسجيل الانصراف
            openSession.checkOut = new Date();
            openSession.duration = (openSession.checkOut - openSession.checkIn) / 1000 / 60; // حساب المدة بالدقائق

            await attendanceRecord.save();

            await interaction.followUp({
                content: `✅ تم تسجيل انصراف ${user.tag} بنجاح.`,
                ephemeral: true
            });

            // تسجيل في السجل
            logger.info(`Forced checkout for ${user.tag} by ${interaction.user.tag} in guild ${guildId}.`);

        } catch (error) {
            logger.error('Error in force-checkout command:', error);
            await interaction.followUp({
                content: 'حدث خطأ أثناء محاولة تسجيل الانصراف.',
                ephemeral: true
            });
        }
    }
}; 