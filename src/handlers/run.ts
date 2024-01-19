import run from "../toll";
import debugLogger from "../debugLogger";

export default async function runHandler() {
    debugLogger("Starting run handler");
    await run();
    debugLogger("Ending run handler");
    process.exit(0);
}
