const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('create_ticket_channels')
    .setDescription('إعداد نظام إدارة التذاكر'),
  async execute(interaction) {
    // التحقق من صلاحيات البوت
    if (!interaction.guild.members.me.permissions.has(['MANAGE_CHANNELS', 'MANAGE_ROLES'])) {
      return interaction.reply({
        content: 'البوت يحتاج إلى صلاحيات إدارة القنوات والأدوار!',
        ephemeral: true
      });
    }

    // في بداية تنفيذ الأمر
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: 'هذا الأمر متاح للمشرفين فقط!',
        ephemeral: true
      });
    }

    const guild = interaction.guild;
    let logChannel, requestChannel;

    try {
      // التحقق من عدم وجود القنوات مسبقاً
      const existingLogChannel = guild.channels.cache.find(c => c.name === 'سجل-التذاكر');
      const existingRequestChannel = guild.channels.cache.find(c => c.name === 'طلب-تذكرة');

      if (existingLogChannel || existingRequestChannel) {
        return interaction.reply({
          content: 'نظام التذاكر موجود بالفعل في هذا السيرفر!',
          ephemeral: true
        });
      }

      // إنشاء قناة السجلات
      logChannel = await guild.channels.create({
        name: 'سجل-التذاكر',
        type: 0,
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
            deny: ['SendMessages'], // حتى المشرفين لا يمكنهم الكتابة
          }
        ].filter(Boolean)
      });

      // إنشاء قناة طلب التذاكر
      requestChannel = await guild.channels.create({
        name: 'طلب-تذكرة',
        type: 0,
        permissionOverwrites: [
          {
            id: guild.id, // @everyone
            allow: ['ViewChannel'],
            deny: ['SendMessages'], // منع الجميع من الكتابة
          },
          {
            id: interaction.client.user.id, // البوت
            allow: ['ViewChannel', 'SendMessages'],
          },
          {
            id: interaction.guild.roles.cache.find(r => r.permissions.has(PermissionFlagsBits.Administrator))?.id,
            allow: ['ViewChannel'],
            deny: ['SendMessages'], // حتى المشرفين لا يمكنهم الكتابة
          }
        ].filter(Boolean)
      });

      // إرسال رسالة مع زر التفاعل
      await requestChannel.send({
        embeds: [{
          title: 'نظام التذاكر',
          description: 'اضغط على الزر أدناه لإنشاء تذكرة جديدة',
          color: 0x00ff00
        }],
        components: [{
          type: 1,
          components: [{
            type: 2,
            style: 1,
            label: 'إنشاء تذكرة',
            custom_id: 'create_ticket'
          }]
        }]
      });

      await interaction.reply({ 
        content: 'تم إعداد نظام التذاكر بنجاح!', 
        ephemeral: true 
      });
    } catch (error) {
      console.error('خطأ في إنشاء القنوات:', error);
      // محاولة تنظيف القنوات التي تم إنشاؤها في حالة حدوث خطأ
      if (logChannel) await logChannel.delete().catch(console.error);
      if (requestChannel) await requestChannel.delete().catch(console.error);
      
      await interaction.reply({
        content: 'حدث خطأ أثناء إعداد نظام التذاكر',
        ephemeral: true
      });
    }
  }
}; 