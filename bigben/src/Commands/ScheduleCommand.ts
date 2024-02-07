import { Command } from "./Command";
import { SoundCronService } from "../Services/SoundCronService";
import { AutocompleteInteraction, CacheType, ChatInputCommandInteraction, CommandInteraction, SlashCommandBuilder } from "discord.js";
import { debugLogger } from "../debugLogger";
import { Logger } from "../Logger";
import Table from 'cli-table3';
import { AddFailureReason, AddSoundCronError } from "../Repositories/ISoundCronRepository";

export class ScheduleCommand implements Command {

  data = new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('View and manipulate the schedule')
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all scheduled intervals')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a new scheduled interval')
        .addStringOption(option =>
          option
            .setName('cron')
            .setDescription('Cron string for the interval')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Name of the interval')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('audio')
            .setDescription('Audio to play')
            .setRequired(true)
        )
        .addBooleanOption(option =>
          option
            .setName('mute')
            .setDescription('Mute the audio')
        )
        .addStringOption(option =>
          option
            .setName('description')
            .setDescription('Description of the interval')
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete a scheduled interval')
        .addStringOption(option =>
          option
            .setName('name')
            .setDescription('Name of the interval')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ).toJSON();

  constructor(private readonly configService: SoundCronService) {}

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.guildId === null) {
      throw new Error("interaction.guildId is somehow null")
    }
    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
      case 'list': {
        debugLogger(`Listing intervals for ${interaction.guildId}`)
        const configs = this.configService.getSoundCronsForServer(interaction.guildId);
        if (configs === null) {
          debugLogger("Configs is null")
          await interaction.reply("No scheduled intervals");
          return;
        }

        const maxPropertyLength = {
          name: "Name".length,
          description: "Description".length,
          cron: "Cron".length,
          audio: "Audio".length,
        };

        const responses = [];
        for await (const config of configs) {
          const { name, description, cron, audio, mute } = config;
          maxPropertyLength.name = Math.max(maxPropertyLength.name, name.length);
          maxPropertyLength.description = Math.max(maxPropertyLength.description, description?.length ?? 0);
          maxPropertyLength.cron = Math.max(maxPropertyLength.cron, cron.length);
          maxPropertyLength.audio = Math.max(maxPropertyLength.audio, audio.length);
          responses.push([name, description ?? "None", cron, audio, mute ? "Yes" : "No" ]);
        }
        if (responses.length === 0) {
          await interaction.reply("No scheduled intervals");
          return;
        }
        const table = new Table({
          head: ['Name', 'Description', 'Cron', 'Audio', 'Mute'],
          colWidths: [
            maxPropertyLength.name + 2,
            maxPropertyLength.description + 2,
            maxPropertyLength.cron + 2,
            maxPropertyLength.audio + 2,
            6,
          ],
          style: {
            head: [],
            border: [],
          }
        });
        table.push(...responses);
        await interaction.reply("```" + table.toString() + "```");
        return;
      }
      case 'add': {
        debugLogger("Adding interval");
        const cron = interaction.options.getString('cron', true);
        const audio = interaction.options.getString('audio', true);
        const mute = interaction.options.getBoolean('mute') ?? undefined;
        const name = interaction.options.getString('name', true);
        const description = interaction.options.getString('description') ?? undefined;
        const interval = {
          cron,
          audio,
          mute,
          name,
          description,
        };
        try {
          await this.configService.addSoundCrons(interaction.guildId, [interval]);
        } catch (err) {
          if (err instanceof AddSoundCronError) {
            if (err.reason === AddFailureReason.AlreadyExists) {
              await interaction.reply(`Interval with name ${name} already exists`);
              return;
            }
          }
          Logger.error("Failed to add interval", err);
          await interaction.reply("Failed to add interval");
          return;
        }
        await interaction.reply("Added interval");
        break;
      }
      case 'delete': {
        debugLogger("Deleting interval");
        const name = interaction.options.getString('name', true);
        try {
          await this.configService.deleteSoundCronByName(interaction.guildId, name);
        } catch (err) {
          Logger.error("Failed to delete interval", err);
          await interaction.reply("Failed to delete interval");
          return;
        }
      }
    }
  }

  async autocomplete(interaction: AutocompleteInteraction) {
    if (interaction.guildId === null) {
      Logger.warn("interaction.guildId is somehow null when running autocomplete");
      return;
    }
    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
      case 'delete': {
        const focusedOption = interaction.options.getFocused(true);
        if (focusedOption.name === 'name') {
          const soundCrons = this.configService.getSoundCronsForServer(interaction.guildId);
          const names = [];
          for await (const config of soundCrons) {
            names.push(config.name);
          }
          const candidates = names.filter(name => name.startsWith(focusedOption.value));
          const responses = candidates.map(name => ({ name, value: name }));
          await interaction.respond(responses);
        }
      }
    }
  }
}
  