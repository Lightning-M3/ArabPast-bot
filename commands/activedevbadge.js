const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('activedevbadge')
    .setDescription('للحصول على شارة المطور النشط'),
  async execute(interaction) {
    await interaction.reply('مبروك! لقد استخدمت الأمر بنجاح. ستظهر الشارة خلال 24 ساعة.');
  }
}; 