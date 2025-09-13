import { createRequire } from "module";
import { dirname } from "path";

const require = createRequire(import.meta.url);
const { FullRepair: FullRepairOriginal } = require("helios-core/dl");

// Récupère le chemin vers le fichier principal du module
const moduleEntry = require.resolve("helios-core/dl");
const moduleDir = dirname(moduleEntry);

export class FullRepair extends FullRepairOriginal {
    constructor(
        commonDir: string,
        instanceDir: string,
        launcherDir: string,
        serverId: string,
        devMode: boolean
    ) {
        super(commonDir, instanceDir, launcherDir, serverId, devMode);
    }

    spawnReceiver(additionalEnvVars?: Record<string, string>) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this as any).__dirname = moduleDir; // injecte le bon __dirname
        super.spawnReceiver(additionalEnvVars);
    }
}
