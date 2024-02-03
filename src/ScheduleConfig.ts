/**
 * A SoundCronConfig is a single sound that is scheduled to play at a certain time.
 * It has configuration about the sound, the time it should play, metadata, and more.
 */
export interface SoundCronConfig {
  cron: string;
  name: string;
  audio: string;

  excludeChannels?: string[];
  mute?: boolean;
  description?: string;
}

/**
 * Throws an error if the supplied parameter is not a SoundCronConfig.
 * @param candidate the object that might be a SoundCronConfig
 */
export function assertSoundCronConfig(
  candidate: unknown,
): asserts candidate is SoundCronConfig {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("Expected an object");
  }

  if (!("cron" in candidate)) {
    throw new Error("Expected cron property");
  }
  if (typeof candidate.cron !== "string") {
    throw new Error("Expected cron property to be a string");
  }

  if (!("audio" in candidate)) {
    throw new Error("Expected audio property");
  }
  if (typeof candidate.audio !== "string") {
    throw new Error("Expected audio property to be a string");
  }

  if (!("name" in candidate)) {
    throw new Error("Expected name property");
  }
  if (typeof candidate.name !== "string") {
    throw new Error("Expected name property to be a string");
  }

  if ("mute" in candidate && typeof candidate.mute !== "boolean") {
    throw new Error("Expected mute property to be a boolean");
  }

  if ("description" in candidate && typeof candidate.description !== "string") {
    throw new Error("Expected description property to be a string");
  }

  if ("excludeChannels" in candidate) {
    if (!Array.isArray(candidate.excludeChannels)) {
      throw new Error("Expected excludeChannels property to be an array");
    }
    for (const channel of candidate.excludeChannels) {
      if (typeof channel !== "string") {
        throw new Error(
          "Expected excludeChannels property to be an array of strings",
        );
      }
    }
  }
}

export function assertSoundCronConfigs(
  candidate: unknown,
): asserts candidate is SoundCronConfig[] {
  if (!Array.isArray(candidate)) {
    throw new Error("Expected an array");
  }
  for (const interval of candidate) {
    assertSoundCronConfig(interval);
  }
}
