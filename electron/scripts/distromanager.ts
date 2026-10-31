import { DistributionAPI } from "helios-core/common";
import * as ConfigManager from "./configmanager";

export const REMOTE_DISTRO_URL = "http://90.0.218.223:8088/distribution.json";

export const DistroAPI = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    "", // Injected forcefully by the preloader.
    "", // Injected forcefully by the preloader.
    REMOTE_DISTRO_URL,
    false
);
