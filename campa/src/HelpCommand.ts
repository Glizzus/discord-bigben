import * as discord from 'discord.js';
import { Command, interactionHasServerId } from './Command';

export class HelpCommand implements Command {
  data = new discord.SlashCommandBuilder()
    .setName('help')
    .setDescription('Display help for the bot')
    .toJSON();
  
  private helpEmbed = new discord.EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('Help')
    .addFields(
      {
        name : 'Cron Jobs',
        value: 'Cron jobs are scheduled tasks that run at predefined times or intervals. They are defined using a *cron expression*, which is a string that represents a set of times.'
      },
      {
        name: 'Resources',
        value: 'For more information, see [Wikipedia](https://en.wikipedia.org/wiki/Cron). For help creating cron expressions, see the [Cron Expression Generator](https://crontab.guru/).'
      },
      { name: '\u200B', value: ' ' },
      {
        name: 'Examples',
        value: 'Here are some examples of cron expressions:'
      },
      {
        name: 'Every midnight',
        value: '`0 0 * * *` (when the minute ends in 0, and the hour ends in 0)',
        inline: true
      },
      {
        name: 'Every 15 minutes',
        value: '`*/15 * * * *` (when the minute is divisible by 15)',
        inline: true
      },
      {
        name: '8:17 PM on every 21st day of the month',
        value: '`17 20 21 * *` (when the minute is 17, the hour is 20, and the day of the month is 21)',
        inline: true
      }
    )
    .addFields({ name: '\u200B', value: ' ' })
    .addFields(
      {
        name: 'SoundCrons',
        value: 'A SoundCron is a sound that plays according to a cron expression'
      },
      {
        name: 'Scheduling SoundCrons',
        value: 'SoundCrons can be added, listed, and removed using the `/schedule` command'
      },
      {
        name: 'Adding a SoundCron',
        value: 'To add a SoundCron, use `/schedule add`',
        inline: true
      },
      {
        name: 'Listing SoundCrons',
        value: 'To list SoundCrons, use `/schedule list`',
        inline: true
      },
      {
        name: 'Removing a SoundCron',
        value: 'To remove a SoundCron, use `/schedule remove`',
        inline: true
      }
    );

  async execute(interaction: discord.ChatInputCommandInteraction): Promise<void> {
    await interaction.reply({ embeds: [this.helpEmbed] });
  }

  /**
   * The help command does not support autocomplete. This function is a no-op.
   * @param interaction the interaction that triggered the command
   */
  async autocomplete(_: discord.AutocompleteInteraction): Promise<void> {}
}