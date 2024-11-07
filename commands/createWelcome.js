const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('create-welcome')
    .setDescription('إنشاء نظام الترحيب التلقائي')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // التحقق من صلاحيات البوت
    if (!interaction.guild.members.me.permissions.has(['ManageChannels'])) {
      return interaction.reply({
        content: 'البوت يحتاج إلى صلاحية إدارة القنوات!',
        ephemeral: true
      });
    }

    try {
      // التحقق من وجود قناة الترحيب
      let welcomeChannel = interaction.guild.channels.cache.find(ch => ch.name === 'ترحيب');

      if (welcomeChannel) {
        return interaction.reply({
          content: 'قناة الترحيب موجودة بالفعل! ✅',
          ephemeral: true
        });
      }

      // إنشاء قناة الترحيب
      welcomeChannel = await interaction.guild.channels.create({
        name: 'ترحيب',
        type: 0, // نوع text
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            allow: ['ViewChannel', 'ReadMessageHistory'],
            deny: ['SendMessages']
          },
          {
            id: interaction.client.user.id,
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
          }
        ]
      });

      // إرسال رسالة تأكيد
      await interaction.reply({
        embeds: [{
          title: '✅ تم إنشاء نظام الترحيب',
          description: `تم إنشاء قناة ${welcomeChannel} بنجاح!\nسيتم الترحيب بالأعضاء الجدد تلقائياً.`,
          color: 0x00ff00
        }],
        ephemeral: true
      });

    } catch (error) {
      console.error('Error creating welcome channel:', error);
      await interaction.reply({
        content: 'حدث خطأ أثناء إنشاء قناة الترحيب.',
        ephemeral: true
      });
    }
  }
}; 