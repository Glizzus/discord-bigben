import { CronJob } from "cron";
import run from '../lib/index'

const everyHour = "0 * * * *";
const cronPattern = process.env["CRON_PATTERN"] ?? everyHour;

const job = new CronJob(
    cronPattern,
    () => {
        // We need an IIFE here because the CronJob function shouldn't return a Promise.
        (async () => {
            try {
                await run();
            } catch (e) {
                console.error(e);
            }
        })();
    },
    null,
    true,
    'America/Chicago'
);

// This is unncessary because of the true parameter above, but it's nice to be explicit.
job.start();