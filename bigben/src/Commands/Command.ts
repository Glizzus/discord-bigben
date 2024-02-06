import { ChatInputCommandInteraction, RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';

export interface Command {
    data: RESTPostAPIApplicationCommandsJSONBody

    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}
