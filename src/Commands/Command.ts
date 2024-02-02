import { ChatInputCommandInteraction, RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';

export default interface Command {
    data: RESTPostAPIApplicationCommandsJSONBody

    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}
