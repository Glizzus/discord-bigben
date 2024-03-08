import * as discord from "discord.js";
import { type SoundCronService } from "./SoundCronService";
import { Command } from "./Command";

/**
 * A command for managing the sound schedule.
 */
export class ScheduleCommand implements Command {
  constructor(private readonly soundCronService: SoundCronService) {}

  data = new discord.SlashCommandBuilder()
    .setName("schedule")
    .setDescription("View and manipulate the sound schedule")
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List all scheduled intervals"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a new scheduled interval")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Name of the interval")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("cron")
            .setDescription("Cron expression")
            .setRequired(true),
        )
        /* The following two are mutually exclusive, but the builder
        is not sophisticated enough to express that */
        .addStringOption((opt) =>
          opt.setName("audio_url").setDescription("Audio to play"),
        )
        .addAttachmentOption((opt) =>
          opt.setName("audio_file").setDescription("Audio file to play"),
        )
        .addBooleanOption((opt) =>
          opt.setName("mute").setDescription("Mute the bot"),
        )
        .addStringOption((opt) =>
          opt
            .setName("description")
            .setDescription("Description of the interval"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a scheduled interval")
        .addStringOption((opt) =>
          opt
            .setName("name")
            .setDescription("Name of the interval")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .toJSON();

  private async list(
    interaction: WithGuildId<discord.ChatInputCommandInteraction>,
  ): Promise<void> {
    const crons = await this.soundCronService.listCrons(interaction.guildId);
    if (crons.length === 0) {
      await interaction.reply("No soundcrons scheduled");
      return;
    }
    const cronStrings = crons.map((cron) => {
      return `${cron.name}: ${cron.cron} - ${cron.audio}`;
    });
    await interaction.reply(cronStrings.join("\n"));
  }

  private async add(
    interaction: WithGuildId<discord.ChatInputCommandInteraction>,
  ): Promise<void> {
    const name = interaction.options.getString("name", true);
    const cron = interaction.options.getString("cron", true);
    const audioUrl = interaction.options.getString("audio_url");
    const audioFile = interaction.options.getAttachment("audio_file");

    if (audioUrl === null && audioFile === null) {
      throw new Error(
        "audio_url or audio_file is required, please provide one",
      );
    }

    if (audioUrl !== null && audioFile !== null) {
      throw new Error(
        "audio_url and audio_file are mutually exclusive, please provide only one",
      );
    }

    const mute = interaction.options.getBoolean("mute") ?? false;
    const description =
      interaction.options.getString("description") ?? undefined;

    const soundCron = {
      name,
      cron,
      audio: audioUrl ?? audioFile!.url,
      mute,
      description,
    };
    await this.soundCronService.addCron(interaction.guildId, soundCron);
    await interaction.reply(`Added soundcron ${name}`);
  }

  private async remove(
    interaction: WithGuildId<discord.ChatInputCommandInteraction>,
  ): Promise<void> {
    const name = interaction.options.getString("name", true);
    await this.soundCronService.removeCron(interaction.guildId, name);
    await interaction.reply(`Removed soundcron ${name}`);
  }

  async execute(
    interaction: discord.ChatInputCommandInteraction,
  ): Promise<void> {
    if (!interactionHasServerId(interaction)) {
      // I'm not entirely sure if this should never happen, but I can't imagine a situation where it would
      throw new Error("Guild ID is null - this should never happen");
    }
    /* We aren't going to validate this because it came from Discord. If
    Discord somehow sends us a bad guild ID, then that is their problem. */
    const subCommand = interaction.options.getSubcommand();
    switch (subCommand) {
      case "list": {
        await this.list(interaction);
        return;
      }
      case "add": {
        await this.add(interaction);
        return;
      }
      case "remove": {
        await this.remove(interaction);
        return;
      }
      default:
        throw new Error(`Unknown subcommand: ${subCommand}`);
    }
  }

  async autocomplete(
    interaction: discord.AutocompleteInteraction,
  ): Promise<void> {
    if (!interactionHasServerId(interaction)) {
      throw new Error("Guild ID is null - this should never happen");
    }
    const subCommand = interaction.options.getSubcommand();
    switch (subCommand) {
      case "remove": {
        const focusedOption = interaction.options.getFocused(true);
        if (focusedOption.name === "name") {
          const soundCrons = await this.soundCronService.listCrons(
            interaction.guildId,
          );
          const candidates = soundCrons.filter(({ name }) =>
            name.startsWith(focusedOption.value),
          );
          const responses = candidates.map(({ name }) => {
            return { name, value: name };
          });
          await interaction.respond(responses);
        }
      }
    }
  }
}

type WithGuildId<T> = T & { guildId: string };

function interactionHasServerId<T extends discord.Interaction>(
  interaction: T,
): interaction is WithGuildId<T> {
  return "guildId" in interaction;
}
