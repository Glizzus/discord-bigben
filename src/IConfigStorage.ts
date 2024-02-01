import { MongoServerConfig } from "./ConfigStorage/MongoConfigRepository";
import { ServerConfig } from "./ScheduleConfig";

export const enum ConfigStorageEvent {
  ConfigUpdated = "configUpdated",
  ConfigRemoved = "configRemoved",
}

export default interface IConfigStorage {
  getAllConfig(): AsyncIterable<{ serverId: string } & ServerConfig>;

  getConfigForServer(serverId: string): Promise<MongoServerConfig | null>;

  updateConfigForServer(
    serverId: string,
    config: ServerConfig,
  ): Promise<MongoServerConfig>;

  deleteConfigForServer(serverId: string): Promise<void>;
}
