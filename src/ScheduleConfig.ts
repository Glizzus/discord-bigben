import * as path from 'path';
import * as fs from 'fs';

export default interface ScheduleConfig {
    servers: ServerConfig[];
}

export interface ServerConfig {
    id: string;
    intervals: ScheduleInterval[];
}

export interface ScheduleInterval {
    cron: string;
    excludeChannels?: string[];
    audio: string;
    mute: boolean;
    description?: string;
}

export function retrieveScheduleConfig(filename: string): ScheduleConfig | null {
    const directories = ['.', '..']
    for (const dir of directories) {
        const filePath = path.join(dir, filename);
        if (fs.existsSync(filePath)) {
            const fileContents = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(fileContents);
        }
    }
    return null;
}
