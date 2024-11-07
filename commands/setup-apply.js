const { 
    SlashCommandBuilder, 
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType
} = require('discord.js');
const ApplySettings = require('../models/ApplySettings');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-apply')
        .setDescription('إعداد نظام التقديم على الإدارة')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('apply-channel')
                .setDescription('قناة التقديم')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText))
        .addChannelOption(option =>
            option.setName('logs-channel')
                .setDescription('قناة سجلات التقديم')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText))
        .addRoleOption(option =>
            option.setName('staff-role')
                .setDescription('رتبة الإداريين المسؤولين عن مراجعة الطلبات')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('apply-title')
                .setDescription('عنوان رسالة التقديم')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('apply-description')
                .setDescription('وصف رسالة التقديم')
                .setRequired(false)),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const applyChannel = interaction.options.getChannel('apply-channel');
            const logsChannel = interaction.options.getChannel('logs-channel');
            const staffRole = interaction.options.getRole('staff-role');
            const applyTitle = interaction.options.getString('apply-title') || '📝 التقديم على الإدارة';
            const applyDescription = interaction.options.getString('apply-description') || 
                'مرحباً بك! إذا كنت ترغب في التقديم على الإدارة، يرجى الضغط على الزر أدناه وملء النموذج المطلوب.';

            // حفظ الإعدادات في قاعدة البيانات
            await ApplySettings.findOneAndUpdate(
                { guildId: interaction.guild.id },
                {
                    guildId: interaction.guild.id,
                    applyChannelId: applyChannel.id,
                    logsChannelId: logsChannel.id,
                    staffRoleId: staffRole.id,
                    applyTitle,
                    applyDescription
                },
                { upsert: true }
            );

            // إنشاء رسالة التقديم
            const applyEmbed = new EmbedBuilder()
                .setTitle(applyTitle)
                .setDescription(applyDescription)
                .setColor(0x2B2D31)
                .addFields(
                    { 
                        name: '📋 الشروط',
                        value: '• العمر: 16+\n• النشاط اليومي\n• الخبرة في الإدارة\n• الالتزام بالقوانين'
                    },
                    {
                        name: '⚠️ ملاحظات',
                        value: '• يرجى الإجابة بصدق على جميع الأسئلة\n• سيتم مراجعة طلبك من قبل الإدارة\n• سيتم إبلاغك بالنتيجة في الخاص'
                    }
                )
                .setFooter({ 
                    text: interaction.guild.name,
                    iconURL: interaction.guild.iconURL()
                })
                .setTimestamp();

            const applyButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('start_apply')
                        .setLabel('قدم الآن')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📝')
                );

            // إرسال رسالة التقديم
            await applyChannel.send({
                embeds: [applyEmbed],
                components: [applyButton]
            });

            // تأكيد الإعداد
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ تم إعداد نظام التقديم بنجاح')
                .setColor(0x00FF00)
                .addFields(
                    { name: 'قناة التقديم', value: `${applyChannel}`, inline: true },
                    { name: 'قناة السجلات', value: `${logsChannel}`, inline: true },
                    { name: 'رتبة المراجعين', value: `${staffRole}`, inline: true }
                );

            await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            console.error('Error in setup-apply:', error);
            await interaction.editReply({
                content: '❌ حدث خطأ أثناء إعداد نظام التقديم',
                ephemeral: true
            });
        }
    },
}; 