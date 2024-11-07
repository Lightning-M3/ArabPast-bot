const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { loadCommands } = require('../path/to/your/commandLoader');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('update')
        .setDescription('تحديث أوامر البوت'),
    async execute(interaction) {
        try {
            await loadCommands();
            
            const rest = new REST().setToken(process.env.TOKEN);
            
            // تحديث الأوامر
            const commands = await loadCommands();
            await rest.put(
                Routes.applicationCommands(interaction.client.user.id),
                { body: commands }
            );

            await interaction.reply({
                content: '✅ تم تحديث الأوامر بنجاح',
                ephemeral: true
            });
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: '❌ حدث خطأ أثناء تحديث الأوامر',
                ephemeral: true
            });
        }
    }
}; 
