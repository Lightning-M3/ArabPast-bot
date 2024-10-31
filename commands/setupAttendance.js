const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup_attendance')
    .setDescription('إعداد نظام تتبع الحضور'),
  async execute(interaction) {
    const guild = interaction.guild;

    try {
      // إنشاء قناة سجل الحضور
      const attendanceLog = await guild.channels.create({
        name: 'سجل-الحضور',
        type: 0,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: ['ViewChannel'],
          }
        ]
      });

      // إنشاء قناة تسجيل الحضور
      const attendanceChannel = await guild.channels.create({
        name: 'تسجيل-الحضور',
        type: 0
      });

      await attendanceChannel.send({
        embeds: [{
          title: 'نظام الحضور',
          description: 'سجل حضورك باستخدام الأزرار أدناه',
          color: 0x00ff00
        }],
        components: [{
          type: 1,
          components: [
            {
              type: 2,
              style: 3,
              label: 'تسجيل حضور',
              custom_id: 'check_in'
            },
            {
              type: 2,
              style: 4,
              label: 'تسجيل انصراف',
              custom_id: 'check_out'
            }
          ]
        }]
      });

      await interaction.reply({ 
        content: 'تم إعداد نظام الحضور بنجاح!', 
        ephemeral: true 
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({ 
        content: 'حدث خطأ أثناء إعداد نظام الحضور', 
        ephemeral: true 
      });
    }
  }
}; 