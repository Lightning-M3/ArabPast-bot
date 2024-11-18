const { SlashCommandBuilder } = require('discord.js');
const StatisticsManager = require('../models/StatisticsManager'); // تأكد من مسار المدير

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('عرض إحصائيات السيرفر.')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('نوع الإحصائيات (daily أو weekly أو monthly)')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const type = interaction.options.getString('type') || 'daily';
            const report = await StatisticsManager.generateReport(interaction.guild.id, type);

            if (!report) {
                return await interaction.followUp({
                    content: 'لم يتم العثور على إحصائيات',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle(`📊 إحصائيات ${type === 'daily' ? 'اليوم' : type === 'weekly' ? 'الأسبوع' : 'الشهر'}`)
                .setDescription(
                    `${report.summary.attendanceSummary}\n` +
                    `${report.summary.ticketsSummary}\n` +
                    `${report.summary.pointsSummary}`
                )
                .setColor(0x00ff00)
                .setTimestamp(report.date);

            await interaction.followUp({ embeds: [embed] });
        } catch (error) {
            logger.error('Error showing stats:', error);
            await interaction.followUp({
                content: 'حدث خطأ أثناء عرض الإحصائيات',
                ephemeral: true
            });
        }
    }
}; 