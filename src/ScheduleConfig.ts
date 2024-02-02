export interface ServerConfig {
  schedule: ScheduleInterval[];
}

export function assertServerConfig(
  candidate: unknown,
): asserts candidate is ServerConfig {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("Expected an object");
  }

  if (!("schedule" in candidate)) {
    throw new Error("Expected schedule property");
  }
  if (!Array.isArray(candidate.schedule)) {
    throw new Error("Expected schedule property to be an array");
  }
  for (const interval of candidate.schedule) {
    assertScheduleInterval(interval);
  }
}

export interface ScheduleInterval {
  cron: string;
  excludeChannels?: string[];
  audio: string;
  mute?: boolean;
  name: string;
  description?: string;
}

export function assertScheduleInterval(
  candidate: unknown,
): asserts candidate is ScheduleInterval {
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
