const { SlashCommandBuilder } = require('discord.js');
const Points = require('../models/Points'); // تأكد من مسار النموذج

module.exports = {
    data: new SlashCommandBuilder()
        .setName('points')
        .setDescription('عرض نقاط المستخدم الخاصة بك.'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const userPoints = await Points.findOne({
                userId: interaction.user.id,
                guildId: interaction.guild.id
            });

            if (!userPoints) {
                return await interaction.followUp({
                    content: 'لم يتم العثور على نقاط مسجلة',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('🌟 نقاطك وإنجازاتك')
                .setDescription(`إحصائيات ${interaction.user}`)
                .addFields([
                    { name: '💫 النقاط الكلية', value: `${userPoints.points}`, inline: true },
                    { name: '📊 المستوى', value: `${userPoints.level}`, inline: true },
                    { name: '🎯 النقاط الأسبوعية', value: `${userPoints.weeklyPoints}`, inline: true },
                    { name: '📈 النقاط الشهرية', value: `${userPoints.monthlyPoints}`, inline: true }
                ])
                .setColor(0xffd700)
                .setTimestamp();

            await interaction.followUp({ embeds: [embed], ephemeral: true });
        } catch (error) {
            logger.error('Error showing points:', error);
            await interaction.followUp({
                content: 'حدث خطأ أثناء عرض النقاط',
                ephemeral: true
            });
        }
    }
}; 