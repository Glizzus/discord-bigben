import { CronJob } from 'cron';
import debugLogger from '../debugLogger';
import run from '../toll';

export default function scheduleHandler(options: { cron?: string }) {
    debugLogger("Starting schedule handler");
    // Commander should ensure this never happens, but they didn't add
    // a nice type for the options object.
    if (options.cron === undefined) {
        throw new Error("Cron string is required");
    }
    const cronPattern = options.cron;
    debugLogger(`Using cron pattern ${cronPattern}`);

    // We need an IIFE here because the CronJob function shouldn't return a Promise.
    const onTick = () => {
        (async () => {
            debugLogger("Cron job ticked at " + new Date().toISOString());
            try {
                await run();
            } catch (e) {
                debugLogger("Error running cron job: " + e);
            }
        })();
    }
    const onComplete = () => {
        debugLogger("Cron job completed at " + new Date().toISOString());
    }
    const timezone = 'America/Chicago';
    const startImmediately = false;

    const job = new CronJob(
        cronPattern,
        onTick,
        onComplete,
        startImmediately,
        timezone
    );
    debugLogger("About to start cron job");
    // Cron job blocks here forever
    job.start();
}
