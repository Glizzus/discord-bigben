import * as discord from 'discord.js';

const options: discord.ClientOptions = {
  intents: [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.GuildMembers,
    discord.GatewayIntentBits.GuildVoiceStates,
  ],
};

export const discordClient = new discord.Client(options);
process.on("SIGTERM", () => discordClient.destroy());
process.on("SIGINT", () => discordClient.destroy());
