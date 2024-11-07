async function updateBotPresence(client) {
  try {
    await client.user.setPresence({
      activities: [{
        name: `${client.guilds.cache.size} سيرفر`,
        type: 3 // WATCHING
      }],
      status: 'online'
    });
  } catch (error) {
    console.error('Error updating bot presence:', error);
  }
}

module.exports = { updateBotPresence }; 