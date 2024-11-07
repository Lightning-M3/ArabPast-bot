const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('يختبر استجابة البوت'),
  async execute(interaction) {
    await interaction.reply('بونج! 🏓');
  }
}; 