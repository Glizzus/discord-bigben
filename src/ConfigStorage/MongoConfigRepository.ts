import IConfigStorage, { ConfigStorageEvent } from "../IConfigStorage";
import { ServerConfig } from "../ScheduleConfig";
import mongodb from "mongodb";
import { EventEmitter } from "events";

export default class MongoConfigStorage extends EventEmitter implements IConfigStorage {

    private readonly collection: mongodb.Collection<ServerConfig>;

    private constructor(collection: mongodb.Collection<ServerConfig>) {
        super();
        this.collection = collection;
    }

    public static async create(collection: mongodb.Collection<ServerConfig>) {
        const instance = new this(collection);
        await instance.ensureIndexOnServerId();
        return instance;
    }

    private async ensureIndexOnServerId() {
        const _ = this.collection.createIndex({ serverId: 1 }, { unique: true });
    }

    getAllConfig(): AsyncIterable<ServerConfig> {
        const cursor = this.collection.find({}, { projection: { _id: 0 } });
        return cursor.stream();
    }

    async getConfigForServer(serverId: string): Promise<ServerConfig | null> {
        return this.collection.findOne({ serverId }, { projection: { _id: 0 } });
    }

    async updateConfigForServer(serverId: string, config: ServerConfig): Promise<void> {
        const result = await this.collection.updateOne({ serverId }, { $set: config }, { upsert: true });
        if (result.modifiedCount === 0 && result.upsertedCount === 0) {
            throw new Error(`Unable to update config for server ${serverId}`);
        }
        this.emit(ConfigStorageEvent.ConfigUpdated, serverId, config);
    }

    async deleteConfigForServer(serverId: string): Promise<void> {
        const result = await this.collection.findOneAndDelete({ serverId });
        if (result === null) {
            throw new Error(`Unable to delete config for server ${serverId}`);
        }
        this.emit(ConfigStorageEvent.ConfigRemoved, serverId, result);
    }

    public on(event: ConfigStorageEvent, listener: (serverId: string, config: ServerConfig) => void): this {
        return super.on(event, listener);
    }

    public emit(event: ConfigStorageEvent, serverId: string, config: ServerConfig): boolean {
        return super.emit(event, serverId, config);
    }
}
