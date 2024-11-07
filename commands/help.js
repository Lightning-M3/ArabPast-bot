const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('عرض معلومات عن البوت وأوامره'),

    async execute(interaction) {
        const mainEmbed = new EmbedBuilder()
            .setTitle('🤖 دليل استخدام البوت')
            .setDescription('مرحباً بك! هذا دليل شامل لجميع أوامر وخدمات البوت.')
            .setColor(0x5865F2)
            .addFields(
                {
                    name: '📋 نظام التذاكر',
                    value: `\`/ticket\` - إنشاء تذكرة دعم فني
\`/force-close-tickets\` - إغلاق جميع التذاكر (للإدارة)
\`/reset-tickets\` - إعادة تعيين نظام التذاكر (للإدارة)`
                },
                {
                    name: '📅 نظام الإجازات',
                    value: `\`/vac vac-request\` - طلب إجازة جديدة
\`/vac vac-list\` - عرض إجازاتك الحالية`
                },
                {
                    name: '👋 نظام الترحيب',
                    value: `\`/create-welcome\` - إعداد نظام الترحيب (للإدارة)`
                },
                {
                    name: '📊 نظام الحضور',
                    value: `\`/setup_attendance\` - إعداد نظام الحضور (للإدارة)
\`/admin-data\` - عرض إحصائيات الإداريين`
                },
                {
                    name: '🛠️ أوامر أخرى',
                    value: `\`/ping\` - فحص سرعة استجابة البوت
\`/activedevbadge\` - معلومات عن شارة المطور`
                }
            )
            .setImage('https://ibb.co/q5947WX') // ضع رابط البانر الخاص بك
            .setFooter({ 
                text: 'ArabPast Bot • جميع الحقوق محفوظة 2024©', 
                iconURL: interaction.client.user.displayAvatarURL() 
            });

        // إنشاء الأزرار
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('سيرفر الدعم')
                    .setURL('https://discord.gg/haxPuBDJwv') // ضع رابط سيرفر الدعم
                    .setStyle(ButtonStyle.Link),
                new ButtonBuilder()
                    .setLabel('شروط الخدمة')
                    .setURL('https://github.com/Lightning-M3/ArabPast-bot/blob/main/TERMS.md') // ضع رابط شروط الخدمة
                    .setStyle(ButtonStyle.Link),
                new ButtonBuilder()
                    .setLabel('سياسة الخصوصية')
                    .setURL('https://github.com/Lightning-M3/ArabPast-bot/blob/main/PRIVACY.md') // ضع رابط سياسة الخصوصية
                    .setStyle(ButtonStyle.Link),
                new ButtonBuilder()
                    .setLabel('إضافة البوت')
                    .setURL(`https://discord.com/api/oauth2/authorize?client_id=${interaction.client.user.id}&permissions=8&scope=bot%20applications.commands`)
                    .setStyle(ButtonStyle.Link)
            );

        // إنشاء Embed ثاني للمعلومات الإضافية
        const infoEmbed = new EmbedBuilder()
            .setTitle('ℹ️ معلومات إضافية')
            .setColor(0x5865F2)
            .addFields(
                {
                    name: '🔧 المميزات',
                    value: `• نظام تذاكر متكامل
• نظام إجازات للإداريين
• نظام ترحيب متطور
• نظام حضور وغياب
• تحديثات مستمرة`
                },
                {
                    name: '📞 الدعم الفني',
                    value: 'للحصول على المساعدة، يمكنك:\n1. الانضمام لسيرفر الدعم\n2. فتح تذكرة دعم فني\n3. التواصل مع الإدارة'
                }
            );

        // إرسال الرسالة مع الـ Embeds والأزرار
        await interaction.reply({
            embeds: [mainEmbed, infoEmbed],
            components: [row],
            ephemeral: true
        });
    },
}; 