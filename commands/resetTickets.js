const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Ticket = require('../models/Ticket');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reset-tickets')
    .setDescription('إعادة ترقيم التذاكر')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // حذف جميع التذاكر المغلقة
      await Ticket.deleteMany({ 
        guildId: interaction.guild.id,
        status: 'closed'
      });

      // إعادة ترقيم التذاكر المفتوحة
      const openTickets = await Ticket.find({
        guildId: interaction.guild.id,
        status: 'open'
      }).sort({ createdAt: 1 });

      for (let i = 0; i < openTickets.length; i++) {
        const ticket = openTickets[i];
        const newNumber = i + 1;
        const newTicketId = `TICKET-${newNumber.toString().padStart(4, '0')}`;

        await Ticket.findByIdAndUpdate(ticket._id, {
          ticketNumber: newNumber,
          ticketId: newTicketId
        });

        // تحديث اسم القناة
        const channel = interaction.guild.channels.cache.get(ticket.channelId);
        if (channel) {
          await channel.setName(`ticket-${newNumber.toString().padStart(4, '0')}`);
        }
      }

      await interaction.followUp({
        embeds: [{
          title: '✅ تم إعادة ترقيم التذاكر',
          description: `تم إعادة ترقيم ${openTickets.length} تذكرة مفتوحة`,
          color: 0x00ff00
        }],
        ephemeral: true
      });

    } catch (error) {
      console.error('Error resetting tickets:', error);
      await interaction.followUp({
        content: 'حدث خطأ أثناء إعادة ترقيم التذاكر',
        ephemeral: true
      });
    }
  }
}; 