import { AutocompleteInteraction, ChatInputCommandInteraction, RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';

/**
 * A command that can be registered with Discord
 * This includes the command's data, behavior, and autocomplete options
 */
export interface Command {
    /**
     * The command's data to be registered with Discord
     */
    data: RESTPostAPIApplicationCommandsJSONBody

    /**
     * Performs the command's action as requested by the user
     * @param interaction the chat input command interaction provided by the user
     * @returns a promise that resolves when the command is executed
     */
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>;

    /**
     * Provides choices for the user to autocomplete
     * @param interaction the autocomplete interaction provided by the user
     * @returns a promise that resolves when the choices are send to the user
     */
    autocomplete: (interaction: AutocompleteInteraction) => Promise<void>;
}
