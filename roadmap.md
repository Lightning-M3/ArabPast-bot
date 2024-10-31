# Discord Bot Roadmap

## Tech Stack

### Backend
- **Node.js**: A fast, lightweight, and scalable runtime for building the bot.
- **discord.js**: A powerful library for interacting with the Discord API using JavaScript.
- **Express.js** (optional): If you plan to add a web interface or API for managing the bot.
- **Cron Jobs (node-cron)**: For scheduling tasks like the daily attendance reset.

### Database
- **MongoDB**: A NoSQL database that works well with Node.js for storing user attendance data, ticket logs, etc.
  - **Mongoose**: A popular ODM (Object Data Modeling) library for MongoDB that simplifies data management.

### Front End (optional)
- **React.js**: If you want to create a dashboard or web interface for managing the bot, generating reports, etc.
- **Next.js**: If you require a server-side rendered front end with React.

### DevOps
- **Docker**: To containerize your bot for easy deployment.
- **GitHub Actions**: For CI/CD to automate testing and deployment.
- **Heroku / Vercel**: For hosting the bot or dashboard (though Heroku has restrictions on free tiers now).

---

## Steps to Build the Bot

### Step 1: Set Up the Development Environment

1. **Install Node.js**: Download and install the latest LTS version of Node.js from [nodejs.org](https://nodejs.org/).
2. **Initialize a new project**:
    ```bash
    mkdir discord-bot
    cd discord-bot
    npm init -y
    ```
3. **Install dependencies**:
    ```bash
    npm install discord.js mongoose dotenv node-cron
    ```
    - **`discord.js`**: For interacting with the Discord API.
    - **`mongoose`**: To manage MongoDB interactions.
    - **`dotenv`**: For environment variables.
    - **`node-cron`**: To schedule tasks like attendance resets.

4. **Create a `.env` file** to store your Discord bot token:
    ```
    DISCORD_TOKEN=your-bot-token-here
    MONGO_URI=your-mongo-db-uri-here
    ```

5. **Create a basic bot structure**:
    ```bash
    touch index.js
    ```

6. In `index.js`, create a simple bot that logs in and listens for commands:

    ```javascript
    const { Client, GatewayIntentBits } = require('discord.js');
    const mongoose = require('mongoose');
    require('dotenv').config();

    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

    // Connect to MongoDB
    mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
      .then(() => console.log('Connected to MongoDB'))
      .catch((err) => console.error('MongoDB connection error:', err));

    client.once('ready', () => {
      console.log(`Bot is online as ${client.user.tag}`);
    });

    client.login(process.env.DISCORD_TOKEN);
    ```

7. **Run the bot**:
    ```bash
    node index.js
    ```

---

### Step 2: Implement Slash Commands

1. **Create a command handler**: This helps you manage commands cleanly. Create a `commands` folder and a `deploy-commands.js` script.

    **`deploy-commands.js`**:
    ```javascript
    const { REST, Routes } = require('discord.js');
    require('dotenv').config();

    const commands = [
      {
        name: 'create_ticket_channels',
        description: 'Setup ticket management system',
      },
      {
        name: 'setup_attendance',
        description: 'Setup attendance tracking system',
      },
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    (async () => {
      try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
          Routes.applicationCommands(process.env.CLIENT_ID),
          { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
      } catch (error) {
        console.error(error);
      }
    })();
    ```

2. **Run the command deployment script**:
    ```bash
    node deploy-commands.js
    ```

---

### Step 3: Implement Ticket Management (Feature 1)

1. **Create Ticket Channels**: Add logic for creating the ticket channels.

    **`commands/createTicketChannels.js`**:
    ```javascript
    const { SlashCommandBuilder } = require('@discordjs/builders');

    module.exports = {
      data: new SlashCommandBuilder()
        .setName('create_ticket_channels')
        .setDescription('Sets up ticket channels'),
      async execute(interaction) {
        const guild = interaction.guild;

        // Create the visible and hidden ticket channels
        const logChannel = await guild.channels.create({
          name: 'سجل-التذاكر',
          type: 'GUILD_TEXT',
          permissionOverwrites: [
            {
              id: guild.id,
              deny: ['VIEW_CHANNEL'],
            },
          ],
        });

        const requestChannel = await guild.channels.create({
          name: 'طلب-تذكرة',
          type: 'GUILD_TEXT',
        });

        // Send an embed message with an interaction button
        await requestChannel.send({
          embeds: [{
            title: 'طلب تذكرة',
            description: 'اضغط على الزر لفتح تذكرة جديدة.',
            color: 0x00FF00,
          }],
          components: [{
            type: 1, // Action Row
            components: [
              {
                type: 2, // Button
                label: 'فتح تذكرة',
                style: 1, // Primary
                customId: 'open_ticket',
              },
            ],
          }],
        });

        await interaction.reply({ content: 'Ticket system initialized!', ephemeral: true });
      },
    };
    ```

2. **Handle the ticket button interaction**:

    **`interactions/openTicket.js`**:
    ```javascript
    module.exports = {
      name: 'interactionCreate',
      async execute(interaction) {
        if (!interaction.isButton()) return;

        if (interaction.customId === 'open_ticket') {
          const ticketNumber = Date.now(); // Use a more meaningful unique ID here
          const ticketChannel = await interaction.guild.channels.create({
            name: `ticket-${ticketNumber}`,
            type: 'GUILD_TEXT',
            permissionOverwrites: [
              {
                id: interaction.guild.id,
                deny: ['VIEW_CHANNEL'],
              },
              {
                id: interaction.user.id,
                allow: ['VIEW_CHANNEL'],
              },
            ],
          });

          await ticketChannel.send({
            content: `${interaction.user}, your ticket is created.`,
          });

          await interaction.reply({ content: 'Ticket created!', ephemeral: true });
        }
      },
    };
    ```

---

### Step 4: Implement Attendance System (Feature 2)

1. **Create Attendance Channels**: Reuse the pattern from ticket creation but with attendance-specific features.

2. **Track Attendance**: Add logic to track check-in and check-out times. Use MongoDB to store user attendance logs.

---

### Step 5: Daily Reset and Attendance Report

1. **Use `node-cron`** to schedule daily resets at 11:59 PM:

    **`cronJobs/dailyReset.js`**:
    ```javascript
    const cron = require('node-cron');
    const Attendance = require('../models/Attendance'); // Example model

    cron.schedule('59 23 * * *', async () => {
      // Logic to reset attendance and send reports
      const attendanceData = await Attendance.find({});

      // Process the daily report and send it to the attendance log channel
      const logChannel = await client.channels.fetch('سجل-الحضور');
      await logChannel.send('Daily Attendance Report: ...');

      // Reset the attendance records
      await Attendance.deleteMany({});
    });
    ```

---

## Best Practices

1. **Use environment variables** for sensitive data like tokens and database URIs.
2. **Modularize your code**: Break down functionality into separate files (e.g., commands, events, database models).
3. **Test incrementally**: Build one feature at a time, test it thoroughly before moving on to the next.
4. **Error handling**: Implement error handling for all async operations (e.g., channel creation, database queries).
5. **Security**: Ensure your bot has the correct permissions and doesn't expose sensitive data.

---

## Future Enhancements

- Add more detailed logging and reporting features.
- Implement user interface improvements based on feedback.
- Explore integration with external services for data storage and analytics.

---

## Conclusion

By following this roadmap, you'll build a Discord bot with two key features: ticket management and attendance tracking. Starting with the setup of the development environment, you’ll progressively implement each feature using best practices like modularization, environment variables, and error handling. The roadmap also ensures that your bot can scale up with future enhancements, like better reporting or integration with external services.

As you continue to develop and optimize your bot, focus on gathering feedback and iterating on features to improve user experience. With a solid foundation in place, you’ll have the flexibility to expand your bot’s functionality and adapt to the needs of your community or server.

Happy coding!