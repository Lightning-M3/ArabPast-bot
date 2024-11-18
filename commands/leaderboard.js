const { SlashCommandBuilder } = require('discord.js');
const PointsManager = require('../models/PointsManager'); // تأكد من مسار المدير

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('عرض قائمة المتصدرين.')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('نوع المتصدرين (weekly أو monthly)')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const type = interaction.options.getString('type') || 'total';
            const leaderboard = await PointsManager.getLeaderboard(interaction.guild.id, type);

            const embed = new EmbedBuilder()
                .setTitle('🏆 المتصدرون')
                .setDescription(`أفضل 10 أعضاء ${type === 'weekly' ? 'هذا الأسبوع' : type === 'monthly' ? 'هذا الشهر' : ''}`)
                .setColor(0xffd700);

            for (let i = 0; i < leaderboard.length; i++) {
                const user = await interaction.client.users.fetch(leaderboard[i].userId);
                embed.addFields({
                    name: `#${i + 1} ${user.tag}`,
                    value: `${leaderboard[i][type === 'weekly' ? 'weeklyPoints' : type === 'monthly' ? 'monthlyPoints' : 'points']} نقطة`
                });
            }

            await interaction.followUp({ embeds: [embed] });
        } catch (error) {
            logger.error('Error showing leaderboard:', error);
            await interaction.followUp({
                content: 'حدث خطأ أثناء عرض المتصدرين',
                ephemeral: true
            });
        }
    }
}; 