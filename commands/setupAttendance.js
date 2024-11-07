const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup_attendance')
    .setDescription('إعداد نظام تتبع الحضور')
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('حدد الرتبة التي ستتمكن من رؤية نظام الحضور')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    // التحقق من صلاحيات البوت
    if (!interaction.guild.members.me.permissions.has(['MANAGE_CHANNELS', 'MANAGE_ROLES'])) {
      return interaction.reply({
        content: 'البوت يحتاج إلى صلاحيات إدارة القنوات والأدوار!',
        ephemeral: true
      });
    }

    const guild = interaction.guild;
    const selectedRole = interaction.options.getRole('role');

    try {
      // البحث عن رتبة "مسجل حضوره" أو إنشاؤها
      let attendanceRole = guild.roles.cache.find(role => role.name === 'مسجل حضوره');
      if (!attendanceRole) {
        attendanceRole = await guild.roles.create({
          name: 'مسجل حضوره',
          color: 0x00FF00,
          reason: 'رتبة تتبع الحضور'
        });
        console.log('تم إنشاء رتبة مسجل حضوره');
      } else {
        console.log('رتبة مسجل حضوره موجودة بالفعل');
      }

      // التحقق من القنوات الموجودة
      const existingLogChannel = guild.channels.cache.find(c => c.name === 'سجل-الحضور');
      const existingAttendanceChannel = guild.channels.cache.find(c => c.name === 'تسجيل-الحضور');

      if (!existingLogChannel) {
        // إنشاء قناة السجلات
        await guild.channels.create({
          name: 'سجل-الحضور',
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
              id: selectedRole.id,
              allow: ['ViewChannel'],
              deny: ['SendMessages'],
            }
          ]
        });
      }

      if (!existingAttendanceChannel) {
        // إنشاء قناة تسجيل الحضور
        const attendanceChannel = await guild.channels.create({
          name: 'تسجيل-الحضور',
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
              id: selectedRole.id,
              allow: ['ViewChannel'],
              deny: ['SendMessages'],
            }
          ]
        });

        // إنشاء رسالة الحضور مع الأزرار
        await attendanceChannel.send({
          embeds: [{
            title: '📋 نظام الحضور',
            description: 'سجل حضورك وانصرافك باستخدام الأزرار أدناه\n\n' +
                        '• يتم حساب الوقت بالدقائق إذا كان أقل من ساعة\n' +
                        '• يتم التسجيل التلقائي للخروج عند 11:59 مساءً\n' +
                        '• يمكنك تسجيل الحضور في أي وقت\n' +
                        '• سيتم إضافة رتبة "مسجل حضوره" عند تسجيل الحضور',
            color: 0x00ff00
          }],
          components: [{
            type: 1,
            components: [
              {
                type: 2,
                style: 3,
                label: 'تسجيل حضور',
                custom_id: 'check_in',
                emoji: '✅'
              },
              {
                type: 2,
                style: 4,
                label: 'تسجيل انصراف',
                custom_id: 'check_out',
                emoji: '👋'
              }
            ]
          }]
        });
      }

      await interaction.reply({
        content: `تم إعداد/تحديث نظام الحضور بنجاح!\n` +
                `الرتبة المحددة: ${selectedRole}\n` +
                `رتبة الحضور: ${attendanceRole}\n` +
                `يمكن لأعضاء الرتبة المحددة فقط رؤية نظام الحضور.`,
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