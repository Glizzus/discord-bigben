import * as discord from "discord.js";
import { type SoundCronService } from "./SoundCronService";
import { WithGuildId, interactionHasServerId, type Command } from "./Command";
import TrieSearch from "trie-search";
import { SoundCron } from "./SoundCron";

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
            .setName("timezone")
            .setDescription("The timezone that the sound will play at")
            /* This autocomplete requires a bit of finesse because there are
            hundreds of timezones */
            .setAutocomplete(true),
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
    const timezone = interaction.options.getString("timezone") ?? undefined;

    const audio = await (async () => {
      if (audioUrl !== null && audioFile !== null) {
        await interaction.reply("Please provide either an audio file or URL, not both");
        return null;
      }
      if (audioUrl !== null) return audioUrl;
      if (audioFile !== null) return audioFile.url;
      await interaction.reply("Please provide an audio file or URL");
      return null;
    })();
  
    if (audio === null) {
      return;
    }

    const mute = interaction.options.getBoolean("mute") ?? false;
    const description =
      interaction.options.getString("description") ?? undefined;

    const soundCron = new SoundCron({
      name,
      cron,
      audio,
      timezone,
      mute,
      description,
    });

    const result = await this.soundCronService.addCron(interaction.guildId, soundCron);
    if (result.success) {
      await interaction.reply(`Added soundcron ${name}`);
      return;
    }
    switch (result.reason) {
      case "InvalidCron":
        await interaction.reply("Invalid cron expression");
        return;
      // We don't tell the user about these errors because they are internal
      case "DatabaseError":
      case "QueueError":
      default:
        await interaction.reply("An error occurred");
        return;
    }
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

  /* A precomputed trie of timezones for autocomplete.
  It is already mapped to the format that Discord expects. */
  private trie = (() => {
    const trieSearch = new TrieSearch<discord.ApplicationCommandOptionChoiceData>("name");
    trieSearch.addAll(Intl.supportedValuesOf("timeZone").map((tz) => {
      return { name: tz, value: tz };
    }));
    // We add this manually because it is not in the Intl list
    trieSearch.add({ name: "Etc/UTC", value: "Etc/UTC" })
    return trieSearch;
  })();

  /* This is a list of common timezones that we will suggest to the user.
  It is pre-mapped to the format that Discord expects. */
  private commonTimeZones = [
    "Etc/UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Phoenix",
    "America/Anchorage",
    "Pacific/Honolulu",
    "America/Toronto",
    "America/Vancouver",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Moscow",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Asia/Dubai",
    "Asia/Karachi",
    "Asia/Jakarta",
    "Asia/Manila",
    "Australia/Sydney",
    "Pacific/Auckland",
  ].map((tz) => {
    return { name: tz, value: tz };
  });

  async autocomplete(
    interaction: discord.AutocompleteInteraction,
  ): Promise<void> {
    if (!interactionHasServerId(interaction)) {
      throw new Error("Guild ID is null - this should never happen");
    }
    const subCommand = interaction.options.getSubcommand();
    switch (subCommand) {
      case "add": {
        const focusedOption = interaction.options.getFocused(true);
        if (focusedOption.name === "timezone") {
          if (focusedOption.value === "") {
            await interaction.respond(this.commonTimeZones);
            return;
          }
          const candidates = this.trie.get(focusedOption.value).slice(0, 25);
          await interaction.respond(candidates);
        }
      }
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
