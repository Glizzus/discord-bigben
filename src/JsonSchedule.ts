import * as path from 'path';
import * as fs from 'fs';

interface JsonSchedule {
    servers: ServerJson[];
}

interface ServerJson {
    id: string;
    intervals: ScheduleInterval[];
}

interface ScheduleInterval {
    cron: string;
    audio: string;
    description?: string;
}

function getJson(filename: string): JsonSchedule | null {
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
