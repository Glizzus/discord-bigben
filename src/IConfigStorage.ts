import { ServerConfig } from "./ScheduleConfig"

export const enum ConfigStorageEvent {
    ConfigUpdated = "configUpdated",
    ConfigRemoved = "configRemoved",
}

export default interface IConfigStorage extends NodeJS.EventEmitter {
    getAllConfig(): AsyncIterable<ServerConfig>
    getConfigForServer(serverId: string): Promise<ServerConfig | null>
    updateConfigForServer(serverId: string, config: ServerConfig): Promise<void>
    deleteConfigForServer(serverId: string): Promise<void>

    on(event: ConfigStorageEvent, listener: (serverId: string, config: ServerConfig) => void): this

    emit(event: ConfigStorageEvent, serverId: string, config: ServerConfig): boolean
}
