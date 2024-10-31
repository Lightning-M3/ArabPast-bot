const { REST, Routes } = require('discord.js');
require('dotenv').config();

const commands = [
  {
    name: 'create_ticket_channels',
    description: 'إعداد نظام إدارة التذاكر',
  },
  {
    name: 'setup_attendance',
    description: 'إعداد نظام تتبع الحضور',
  }
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('بدء تحديث أوامر التطبيق (/).');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );

    console.log('تم تحديث أوامر التطبيق (/) بنجاح لجميع السيرفرات.');
  } catch (error) {
    console.error(error);
  }
})(); 