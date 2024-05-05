import { Command } from './Command';
import * as discord from 'discord.js';
import * as winston from 'winston';

const options: discord.ClientOptions = {
  intents: [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.GuildMembers,
    discord.GatewayIntentBits.GuildVoiceStates,
  ],
};

export async function start(token: string, clientId: string, commands: Record<string, Command>, logger: winston.Logger): Promise<void> {
  const client = new discord.Client(options)
    .on(discord.Events.InteractionCreate, async (interaction) => {
      if (interaction.isChatInputCommand()) {
        const command = commands[interaction.commandName];
        if (command !== undefined) {
          await command.execute(interaction);
          return;
        }
        await interaction.reply('Unknown command');
      } else if (interaction.isAutocomplete()) {
        const command = commands[interaction.commandName];
        if (command !== undefined) {
          await command.autocomplete(interaction);
        }
      }
    })
    .on(discord.Events.ClientReady, () => {
      logger.info('Discord client ready');
    })
    .on(discord.Events.Error, (err) => {
      logger.error(err);
    });

  await Promise.all([
    client.login(token),
    new discord.REST().setToken(token).put(discord.Routes.applicationCommands(clientId), {
      body: Object.values(commands).map((c) => c.data),
    }),
  ]);
}
