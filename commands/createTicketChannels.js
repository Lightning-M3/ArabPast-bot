const { SlashCommandBuilder } = require('@discordjs/builders');

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
    const guild = interaction.guild;

    try {
      // إنشاء قناة السجلات
      const logChannel = await guild.channels.create({
        name: 'سجل-التذاكر',
        type: 0, // نوع القناة النصية
        permissionOverwrites: [
          {
            id: guild.id,
            deny: ['ViewChannel', 'SendMessages'],
          },
          {
            id: interaction.guild.me.id,
            allow: ['ViewChannel', 'SendMessages'],
          },
          {
            id: interaction.guild.roles.cache.find(r => r.permissions.has('ADMINISTRATOR')).id,
            allow: ['ViewChannel'],
          }
        ]
      });

      // إنشاء قناة طلب التذاكر
      const requestChannel = await guild.channels.create({
        name: 'طلب-تذكرة',
        type: 0
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
      console.error(error);
      await interaction.reply({ 
        content: 'حدث خطأ أثناء إعداد نظام التذاكر', 
        ephemeral: true 
      });
    }
  }
}; 