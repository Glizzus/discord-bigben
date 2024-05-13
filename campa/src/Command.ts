import {
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  type SlashCommandBuilder,
  type Interaction
} from "discord.js";

/**
 * An interface for a command that can be executed by a bot.
 */
export interface Command {
  /**
   * The data for the command that will be registered with Discord.
   * Changing this will mean that the command will be re-registered with Discord,
   * which takes a few minutes.
   */
  data: ReturnType<InstanceType<typeof SlashCommandBuilder>["toJSON"]>;

  /**
   * Performs the action that happens when this command is executed.
   * @param interaction the interaction that triggered the command
   * @returns an empty promise that resolves when the command has been executed
   */
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;

  /**
   * Handles the autocomplete for this command. This might be an empty function if the command
   * does not support autocomplete.
   * @param interaction  the interaction that triggered the command
   * @returns an empty promise that resolves when the autocomplete is sent
   */
  autocomplete: (interaction: AutocompleteInteraction) => Promise<void>;
}

export type WithGuildId<T> = T & { guildId: string };

export function interactionHasServerId<T extends Interaction>(
  interaction: T,
): interaction is WithGuildId<T> {
  return "guildId" in interaction;
}
