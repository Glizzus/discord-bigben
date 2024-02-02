import Command from "./Command";
import ConfigService from "../Services/ConfigService";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import debugLogger from "../debugLogger";

const schedule = new SlashCommandBuilder()
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
  ).toJSON();

export default class ScheduleCommand implements Command {

  private readonly listSubcommandName = 'list';
  private readonly addSubcommandName = 'add';

  data = new SlashCommandBuilder()
    .setName('schedule')
    .setDescription('View and manipulate the schedule')
    .addSubcommand(subcommand =>
      subcommand
        .setName(this.listSubcommandName)
        .setDescription('List all scheduled intervals')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName(this.addSubcommandName)
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
    ).toJSON();


  constructor(private readonly configService: ConfigService) {}

  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.guildId === null) {
      throw new Error("interaction.guildId is somehow null")
    }
    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
      case 'list': {
        const configs = await this.configService.getConfigForServer(interaction.guildId);
        if (configs === null) {
          await interaction.reply("No scheduled intervals");
          return;
        }
        const intervals = configs.schedule;
        if (intervals.length === 0) {
          await interaction.reply("No scheduled intervals");
          return;
        }
        const response = intervals.map((interval, i) => {
          return `${i + 1}. ${interval.cron} - ${interval.audio}`;
        }).join('\n');
        await interaction.reply(response);
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
          await this.configService.addServer(interaction.guildId, { schedule: [interval]});
        } catch (err) {
          debugLogger("Failed to add interval", err);
          await interaction.reply("Failed to add interval");
          return;
        }
        await interaction.reply("Added interval");
      }

    }
  }

}
  