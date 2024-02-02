import IConfigStorage from "../IConfigStorage";
import { ServerConfig } from "../ScheduleConfig";
import mongodb from "mongodb";
import { EventEmitter } from "events";

export type MongoServerConfig = { serverId: string } & ServerConfig;

export default class MongoConfigStorage
  extends EventEmitter
  implements IConfigStorage
{
  private readonly collection: mongodb.Collection<MongoServerConfig>;

  private constructor(collection: mongodb.Collection<MongoServerConfig>) {
    super();
    this.collection = collection;
  }

  public static async create(
    collection: mongodb.Collection<MongoServerConfig>,
  ) {
    const instance = new this(collection);
    await instance.ensureIndexOnServerId();
    return instance;
  }

  private async ensureIndexOnServerId() {
    const _ = this.collection.createIndex({ serverId: 1 }, { unique: true });
  }

  getAllConfig() {
    const cursor = this.collection.find({}, { projection: { _id: 0 } });
    return cursor.stream();
  }

  async getConfigForServer(serverId: string): Promise<MongoServerConfig | null> {
    return this.collection.findOne({ serverId }, { projection: { _id: 0 } });
  }

  async updateConfigForServer(serverId: string, config: ServerConfig) {
    const result = await this.collection.findOneAndUpdate(
      { serverId },
      { $set: config },
      { upsert: true, returnDocument: "after" },
    );
    if (result === null) {
      throw new Error(`Unable to update config for server ${serverId}`);
    }
    return result;
  }

  async deleteConfigForServer(serverId: string): Promise<void> {
    const result = await this.collection.findOneAndDelete({ serverId });
    if (result === null) {
      throw new Error(`Unable to delete config for server ${serverId}`);
    }
  }
}
