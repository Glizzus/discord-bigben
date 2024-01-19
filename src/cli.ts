import commander from 'commander';

import runHandler from './handlers/run';
import scheduleHandler from './handlers/schedule';

const program = new commander.Command();
program
  .name("discord-bigben")
  .description("A bot that joins a discord channel and plays a sound")

program
  .command("run")
  .description("Run the bot one time, then exit")
  .action(runHandler);

program
  .command("schedule")
  .description("Run the bot")
  .requiredOption("-c, --cron <cron>", "Cron string to run the bot on")
  .action(scheduleHandler)

program.parse(process.argv);

if (program.args.length === 0) {
  program.help();
}
