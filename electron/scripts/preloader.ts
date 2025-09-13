import { HeliosDistribution as PhyloriaDistribution } from "helios-core/common";
import * as ConfigManager from "./configmanager";

/**
 *
 * @param {PhyloriaDistribution | null} data
 */
export function onDistroLoad(data: PhyloriaDistribution | null) {
    if (data != null) {
        // Resolve the selected server if its value has yet to be set.
        if (
            ConfigManager.getSelectedServer() == null ||
            data.getServerById(ConfigManager.getSelectedServer() as string) ==
                null
        ) {
            console.info("Determining default selected server..");
            const mainServer = data.getMainServer();
            if (mainServer && mainServer.rawServer && mainServer.rawServer.id) {
                ConfigManager.setSelectedServer(mainServer.rawServer.id);
                ConfigManager.save();
            } else {
                console.warn("Main server is not available or missing id.");
            }
        }
    }

    return data;
}
