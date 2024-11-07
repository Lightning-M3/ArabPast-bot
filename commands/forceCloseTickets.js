const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Ticket = require('../models/Ticket');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('force-close-tickets')
        .setDescription('فرض إغلاق جميع التذاكر المفتوحة')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: 'هذا الأمر متاح للمشرفين فقط!',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // البحث عن جميع التذاكر المفتوحة
            const openTickets = await Ticket.find({
                guildId: interaction.guild.id,
                status: 'open'
            });

            if (openTickets.length === 0) {
                return interaction.followUp({
                    content: 'لا توجد تذاكر مفتوحة حالياً.',
                    ephemeral: true
                });
            }

            let closedCount = 0;
            let failedCount = 0;
            const logChannel = interaction.guild.channels.cache.find(c => c.name === 'سجل-التذاكر');

            // إغلاق كل تذكرة
            for (const ticket of openTickets) {
                try {
                    const channel = interaction.guild.channels.cache.get(ticket.channelId);
                    
                    if (channel) {
                        // إرسال رسالة تنبيه في قناة التذكرة
                        await channel.send({
                            embeds: [{
                                title: '⚠️ إغلاق إجباري للتذكرة',
                                description: `تم إغلاق هذه التذكرة بواسطة ${interaction.user}`,
                                color: 0xff0000,
                                timestamp: new Date()
                            }]
                        });

                        // حذف القناة بعد 5 ثواني
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        await channel.delete();
                    }

                    // تحديث حالة التذكرة في قاعدة البيانات
                    ticket.status = 'closed';
                    await ticket.save();

                    // تسجيل في قناة السجلات
                    if (logChannel) {
                        await logChannel.send({
                            embeds: [{
                                title: '🔒 إغلاق إجباري للتذكرة',
                                description: `تم إغلاق التذكرة بواسطة ${interaction.user}`,
                                fields: [
                                    {
                                        name: 'رقم التذكرة',
                                        value: ticket.ticketId
                                    },
                                    {
                                        name: 'التاريخ والوقت',
                                        value: new Date().toLocaleString('en-GB', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            hour12: true,
                                            timeZone: 'Asia/Riyadh'
                                        })
                                    }
                                ],
                                color: 0xff0000,
                                timestamp: new Date()
                            }]
                        });
                    }

                    closedCount++;
                } catch (error) {
                    console.error(`Error closing ticket ${ticket.ticketId}:`, error);
                    failedCount++;
                }
            }

            // إرسال تقرير نهائي
            await interaction.followUp({
                embeds: [{
                    title: '🔒 تقرير إغلاق التذاكر',
                    description: 'تم إغلاق التذاكر المفتوحة',
                    fields: [
                        {
                            name: '✅ تم إغلاقها بنجاح',
                            value: `${closedCount} تذكرة`
                        },
                        {
                            name: '❌ فشل في إغلاقها',
                            value: `${failedCount} تذكرة`
                        }
                    ],
                    color: closedCount > 0 ? 0x00ff00 : 0xff0000,
                    timestamp: new Date()
                }],
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in force-close-tickets command:', error);
            await interaction.followUp({
                content: 'حدث خطأ أثناء محاولة إغلاق التذاكر.',
                ephemeral: true
            });
        }
    }
}; 