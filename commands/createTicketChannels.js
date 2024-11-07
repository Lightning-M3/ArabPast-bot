const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('create_ticket_channels')
    .setDescription('إعداد نظام إدارة التذاكر'),
  async execute(interaction) {
    // التحقق من صلاحيات البوت
    if (!interaction.guild.members.me.permissions.has(['ManageChannels', 'ManageRoles'])) {
      return interaction.reply({
        content: 'البوت يحتاج إلى صلاحيات إدارة القنوات والأدوار!',
        ephemeral: true
      });
    }

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: 'هذا الأمر متاح للمشرفين فقط!',
        ephemeral: true
      });
    }

    const guild = interaction.guild;
    let logChannel, requestChannel, ticketCategory;

    try {
      // التحقق من عدم وجود القنوات والكاتاجوري مسبقاً
      const existingCategory = guild.channels.cache.find(c => c.type === 4 && c.name === '🎫 نظام التذاكر');
      const existingLogChannel = guild.channels.cache.find(c => c.name === 'سجل-التذاكر');
      const existingRequestChannel = guild.channels.cache.find(c => c.name === 'طلب-تذكرة');

      if (existingCategory || existingLogChannel || existingRequestChannel) {
        return interaction.reply({
          content: 'نظام التذاكر موجود بالفعل في هذا السيرفر!',
          ephemeral: true
        });
      }

      // إنشاء الكاتاجوري
      ticketCategory = await guild.channels.create({
        name: '🎫 نظام التذاكر',
        type: 4, // CategoryChannel
        permissionOverwrites: [
          {
            id: guild.id,
            allow: ['ViewChannel'],
            deny: ['SendMessages']
          },
          {
            id: interaction.client.user.id,
            allow: ['ViewChannel', 'SendMessages', 'ManageChannels']
          }
        ]
      });

      // إنشاء قناة السجلات
      logChannel = await guild.channels.create({
        name: 'سجل-التذاكر',
        type: 0,
        parent: ticketCategory.id,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: ['ViewChannel', 'SendMessages'],
          },
          {
            id: interaction.client.user.id,
            allow: ['ViewChannel', 'SendMessages'],
          },
          {
            id: interaction.guild.roles.cache.find(r => r.permissions.has(PermissionFlagsBits.Administrator))?.id,
            allow: ['ViewChannel'],
            deny: ['SendMessages'],
          }
        ].filter(Boolean)
      });

      // إنشاء قناة طلب التذاكر
      requestChannel = await guild.channels.create({
        name: 'طلب-تذكرة',
        type: 0,
        parent: ticketCategory.id,
        permissionOverwrites: [
          {
            id: guild.id,
            allow: ['ViewChannel'],
            deny: ['SendMessages'],
          },
          {
            id: interaction.client.user.id,
            allow: ['ViewChannel', 'SendMessages'],
          },
          {
            id: interaction.guild.roles.cache.find(r => r.permissions.has(PermissionFlagsBits.Administrator))?.id,
            allow: ['ViewChannel'],
            deny: ['SendMessages'],
          }
        ].filter(Boolean)
      });

      // إرسال رسالة مع زر التفاعل
      await requestChannel.send({
        embeds: [{
          title: '🎫 نظام التذاكر',
          description: 'للحصول على مساعدة أو للتواصل مع الإدارة، اضغط على الزر أدناه لإنشاء تذكرة جديدة.',
          fields: [
            {
              name: '📝 ملاحظات',
              value: '• يمكنك إنشاء 3 تذاكر كحد أقصى في اليوم\n' +
                     '• يمكنك فتح تذكرة واحدة فقط في نفس الوقت\n' +
                     '• يتم إغلاق التذكرة تلقائياً بعد 24 ساعة'
            }
          ],
          color: 0x2b2d31
        }],
        components: [{
          type: 1,
          components: [{
            type: 2,
            style: 1,
            label: 'إنشاء تذكرة',
            emoji: '🎫',
            custom_id: 'create_ticket'
          }]
        }]
      });

      await interaction.reply({ 
        embeds: [{
          title: '✅ تم إعداد نظام التذاكر',
          description: `تم إنشاء:\n` +
                      `• كاتاجوري ${ticketCategory}\n` +
                      `• قناة ${requestChannel}\n` +
                      `• قناة ${logChannel}`,
          color: 0x00ff00
        }],
        ephemeral: true 
      });

    } catch (error) {
      console.error('خطأ في إنشاء نظام التذاكر:', error);
      // محاولة تنظيف القنوات التي تم إنشاؤها في حالة حدوث خطأ
      if (logChannel) await logChannel.delete().catch(console.error);
      if (requestChannel) await requestChannel.delete().catch(console.error);
      if (ticketCategory) await ticketCategory.delete().catch(console.error);
      
      await interaction.reply({
        content: 'حدث خطأ أثناء إعداد نظام التذاكر',
        ephemeral: true
      });
    }
  }
}; 