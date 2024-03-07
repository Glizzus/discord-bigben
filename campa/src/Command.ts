import {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
} from "discord.js";

export interface Command {
  data: ReturnType<InstanceType<typeof SlashCommandBuilder>["toJSON"]>;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete: (interaction: AutocompleteInteraction) => Promise<void>;
}
