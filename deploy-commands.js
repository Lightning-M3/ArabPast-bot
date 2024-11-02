const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const commands = [];
// جلب جميع ملفات الأوامر من مجلد commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`✅ تم تحميل الأمر: ${command.data.name}`);
    } else {
        console.log(`⚠️ الأمر في ${filePath} يفتقد إلى خاصية data أو execute المطلوبة`);
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`بدء تحديث ${commands.length} من الأوامر (/).`);

        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log(`✅ تم تحديث ${data.length} من الأوامر (/) بنجاح.`);
    } catch (error) {
        console.error(error);
    }
})(); 