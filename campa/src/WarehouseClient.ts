export interface WarehouseClient {
  download: (serverId: string, audioUrl: string) => Promise<void>;
  remove: (serverId: string, audioUrl: string) => Promise<void>;
}
