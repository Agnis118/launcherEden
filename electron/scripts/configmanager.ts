import { app } from "electron";
import fs from "fs-extra";
import { Type } from "helios-distribution-types";
import os from "os";
import path from "path";

// Type definitions
interface AuthAccount {
    type: "mojang" | "microsoft";
    accessToken: string;
    username: string;
    uuid: string;
    displayName: string;
    expiresAt?: Date;
    microsoft?: {
        access_token: string;
        refresh_token: string;
        expires_at: Date;
    };
}

interface ModConfiguration {
    id: string;
    mods?: ModConfigurationMap;
    value?: boolean;
    [key: string]: unknown;
}

interface ModConfigurationMap {
    [key: string]: ModConfiguration | boolean;
}

interface JavaConfig {
    minRAM: string;
    maxRAM: string;
    executable: string | null;
    jvmOptions: string[];
}

interface NewsCache {
    date: string | null;
    content: string | null;
    dismissed: boolean;
}

interface GameSettings {
    resWidth: number;
    resHeight: number;
    fullscreen: boolean;
    autoConnect: boolean;
    launchDetached: boolean;
}

interface LauncherSettings {
    allowPrerelease: boolean;
    dataDirectory: string;
}

interface Settings {
    game: GameSettings;
    launcher: LauncherSettings;
}

interface ConfigType {
    settings: Settings;
    newsCache: NewsCache;
    clientToken: string | null;
    selectedServer: string | null;
    selectedAccount: string | null;
    authenticationDatabase: { [uuid: string]: AuthAccount };
    modConfigurations: ModConfiguration[];
    javaConfig: { [serverid: string]: JavaConfig };
}

interface RamConfig {
    minimum?: number | null;
    recommended?: number | null;
}

interface EffectiveJavaOptions {
    suggestedMajor: number;
}

interface ServerData {
    rawServer: {
        id: string;
        javaOptions?: {
            ram?: RamConfig;
        };
    };
    effectiveJavaOptions: EffectiveJavaOptions;
    modules: ModuleData[];
}

interface ModuleData {
    rawModule: {
        type: Type;
    };
    subModules: ModuleData[];
    getRequired(): { value: boolean; def?: boolean };
    getVersionlessMavenIdentifier(): string;
    hasSubModules?(): boolean;
}

interface DistributionData {
    servers: ServerData[];
}

// Constants
const sysRoot =
    process.env.APPDATA ||
    (process.platform == "darwin"
        ? process.env.HOME
            ? process.env.HOME + "/Library/Application Support"
            : ""
        : process.env.HOME || "");

const dataPath = path.join(sysRoot || "", ".phylorialauncher");
const launcherDir = app.getPath("userData");

/**
 * Retrieve the absolute path of the launcher directory.
 */
export function getLauncherDirectory(): string {
    return launcherDir;
}

/**
 * Get the launcher's data directory. This is where all files related
 * to game launch are installed (common, instances, java, etc).
 */
export function getDataDirectory(def = false): string {
    return !def
        ? config?.settings?.launcher?.dataDirectory ??
              DEFAULT_CONFIG.settings.launcher.dataDirectory
        : DEFAULT_CONFIG.settings.launcher.dataDirectory;
}

/**
 * Set the new data directory.
 */
export const setDataDirectory = function (dataDirectory: unknown): void {
    if (config && config.settings && config.settings.launcher) {
        if (typeof dataDirectory === "string") {
            config.settings.launcher.dataDirectory = dataDirectory;
        } else {
            console.error("dataDirectory must be a string.");
        }
    } else {
        console.error("Cannot set dataDirectory: config is not loaded.");
    }
};

const configPath = path.join(getLauncherDirectory(), "config.json");
const configPathLEGACY = path.join(dataPath, "config.json");
const firstLaunch =
    !fs.existsSync(configPath) && !fs.existsSync(configPathLEGACY);

export function getAbsoluteMinRAM(ram?: RamConfig | null): number {
    if (ram?.minimum != null) {
        return ram.minimum / 1024;
    } else {
        // Legacy behavior
        const mem = os.totalmem();
        return mem >= 6 * 1073741824 ? 3 : 2;
    }
}

export function getAbsoluteMaxRAM(): number {
    const mem = os.totalmem();
    const gT16 = mem - 16 * 1073741824;
    return Math.floor(
        (mem - (gT16 > 0 ? gT16 / 8 + (16 * 1073741824) / 4 : mem / 4)) /
            1073741824
    );
}

function resolveSelectedRAM(ram?: RamConfig | null): string {
    if (ram?.recommended != null) {
        return `${ram.recommended}M`;
    } else {
        // Legacy behavior
        const mem = os.totalmem();
        return mem >= 8 * 1073741824
            ? "4G"
            : mem >= 6 * 1073741824
            ? "3G"
            : "2G";
    }
}

/**
 * Three types of values:
 * Static = Explicitly declared.
 * Dynamic = Calculated by a private function.
 * Resolved = Resolved externally, defaults to null.
 */
const DEFAULT_CONFIG: ConfigType = {
    settings: {
        game: {
            resWidth: 1280,
            resHeight: 720,
            fullscreen: false,
            autoConnect: true,
            launchDetached: true,
        },
        launcher: {
            allowPrerelease: false,
            dataDirectory: dataPath,
        },
    },
    newsCache: {
        date: null,
        content: null,
        dismissed: false,
    },
    clientToken: null,
    selectedServer: null, // Resolved
    selectedAccount: null,
    authenticationDatabase: {},
    modConfigurations: [],
    javaConfig: {},
};

let config: ConfigType | null = null;

// Persistence Utility Functions

/**
 * Save the current configuration to a file.
 */
export function save(): void {
    if (config) {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4), "utf8");
    }
}

/**
 * Load the configuration into memory. If a configuration file exists,
 * that will be read and saved. Otherwise, a default configuration will
 * be generated. Note that "resolved" values default to null and will
 * need to be externally assigned.
 */
export function load(): void {
    let doLoad = true;
    if (!fs.existsSync(configPath)) {
        // Create all parent directories.
        fs.ensureDirSync(path.join(configPath, ".."));
        if (fs.existsSync(configPathLEGACY)) {
            fs.moveSync(configPathLEGACY, configPath);
        } else {
            doLoad = false;
            config = DEFAULT_CONFIG;
            save();
        }
    }
    if (doLoad) {
        let doValidate = false;
        try {
            const configData = JSON.parse(fs.readFileSync(configPath, "utf8"));
            config = configData;
            doValidate = true;
        } catch (err) {
            console.error(err);
            console.info(
                "Configuration file contains malformed JSON or is corrupt."
            );
            console.info("Generating a new configuration file.");
            fs.ensureDirSync(path.join(configPath, ".."));
            config = DEFAULT_CONFIG;
            save();
        }
        if (doValidate && config) {
            config = validateKeySet(DEFAULT_CONFIG, config);
            save();
        }
    }
    console.info("Successfully Loaded");
}

/**
 * @returns Whether or not the manager has been loaded.
 */
export function isLoaded(): boolean {
    return config != null;
}

/**
 * Validate that the destination object has at least every field
 * present in the source object. Assign a default value otherwise.
 */
function validateKeySet(srcObj: ConfigType, destObj: ConfigType): ConfigType {
    // Handle each property explicitly to avoid any usage
    if (typeof destObj.settings === "undefined") {
        destObj.settings = srcObj.settings;
    } else if (srcObj.settings && typeof srcObj.settings === "object") {
        destObj.settings = validateSettings(srcObj.settings, destObj.settings);
    }

    if (typeof destObj.newsCache === "undefined") {
        destObj.newsCache = srcObj.newsCache;
    } else if (srcObj.newsCache && typeof srcObj.newsCache === "object") {
        destObj.newsCache = validateNewsCache(
            srcObj.newsCache,
            destObj.newsCache
        );
    }

    if (typeof destObj.clientToken === "undefined") {
        destObj.clientToken = srcObj.clientToken;
    }

    if (typeof destObj.selectedServer === "undefined") {
        destObj.selectedServer = srcObj.selectedServer;
    }

    if (typeof destObj.selectedAccount === "undefined") {
        destObj.selectedAccount = srcObj.selectedAccount;
    }

    if (typeof destObj.modConfigurations === "undefined") {
        destObj.modConfigurations = srcObj.modConfigurations;
    }

    // Skip validation for blacklisted items (they maintain their existing values)
    return destObj;
}

function validateSettings(
    srcSettings: Settings,
    destSettings: Settings
): Settings {
    // Validate game settings
    if (typeof destSettings.game === "undefined") {
        destSettings.game = srcSettings.game;
    } else if (srcSettings.game && typeof srcSettings.game === "object") {
        if (typeof destSettings.game.resWidth === "undefined") {
            destSettings.game.resWidth = srcSettings.game.resWidth;
        }
        if (typeof destSettings.game.resHeight === "undefined") {
            destSettings.game.resHeight = srcSettings.game.resHeight;
        }
        if (typeof destSettings.game.fullscreen === "undefined") {
            destSettings.game.fullscreen = srcSettings.game.fullscreen;
        }
        if (typeof destSettings.game.autoConnect === "undefined") {
            destSettings.game.autoConnect = srcSettings.game.autoConnect;
        }
        if (typeof destSettings.game.launchDetached === "undefined") {
            destSettings.game.launchDetached = srcSettings.game.launchDetached;
        }
    }

    // Validate launcher settings
    if (typeof destSettings.launcher === "undefined") {
        destSettings.launcher = srcSettings.launcher;
    } else if (
        srcSettings.launcher &&
        typeof srcSettings.launcher === "object"
    ) {
        if (typeof destSettings.launcher.allowPrerelease === "undefined") {
            destSettings.launcher.allowPrerelease =
                srcSettings.launcher.allowPrerelease;
        }
        if (typeof destSettings.launcher.dataDirectory === "undefined") {
            destSettings.launcher.dataDirectory =
                srcSettings.launcher.dataDirectory;
        }
    }

    return destSettings;
}

function validateNewsCache(
    srcNewsCache: NewsCache,
    destNewsCache: NewsCache
): NewsCache {
    if (typeof destNewsCache.date === "undefined") {
        destNewsCache.date = srcNewsCache.date;
    }
    if (typeof destNewsCache.content === "undefined") {
        destNewsCache.content = srcNewsCache.content;
    }
    if (typeof destNewsCache.dismissed === "undefined") {
        destNewsCache.dismissed = srcNewsCache.dismissed;
    }
    return destNewsCache;
}

/**
 * Check to see if this is the first time the user has launched the
 * application. This is determined by the existence of the data path.
 */
export function isFirstLaunch(): boolean {
    return firstLaunch;
}

/**
 * Returns the name of the folder in the OS temp directory which we
 * will use to extract and store native dependencies for game launch.
 */
export function getTempNativeFolder(): string {
    return "WCNatives";
}

// System Settings (Unconfigurable on UI)

/**
 * Retrieve the news cache to determine
 * whether or not there is newer news.
 */
export function getNewsCache(): NewsCache | null {
    return config?.newsCache ?? null;
}

/**
 * Set the new news cache object.
 */
export function setNewsCache(newsCache: NewsCache | undefined): void {
    if (config) {
        config.newsCache = newsCache || DEFAULT_CONFIG.newsCache;
    } else {
        console.error("Cannot set newsCache: config is not loaded.");
    }
}

/**
 * Set whether or not the news has been dismissed (checked)
 */
export function setNewsCacheDismissed(dismissed: boolean | undefined): void {
    if (config && config.newsCache) {
        config.newsCache.dismissed = dismissed ?? false;
    } else {
        console.error(
            "Cannot set newsCache.dismissed: config or newsCache is not loaded."
        );
    }
}

/**
 * Retrieve the common directory for shared
 * game files (assets, libraries, etc).
 */
export function getCommonDirectory(): string {
    return path.join(getDataDirectory(), "common");
}

/**
 * Retrieve the instance directory for the per
 * server game directories.
 */
export function getInstanceDirectory(): string {
    return path.join(getDataDirectory(), "instances");
}

/**
 * Retrieve the launcher's Client Token.
 * There is no default client token.
 */
export function getClientToken(): string | null {
    if (config && typeof config.clientToken === "string") {
        return config.clientToken;
    }
    return null;
}

/**
 * Set the launcher's Client Token.
 */
export function setClientToken(clientToken: string | null | undefined): void {
    if (config) {
        config.clientToken = clientToken ?? null;
    } else {
        console.error("Cannot set clientToken: config is not loaded.");
    }
}

/**
 * Retrieve the ID of the selected serverpack.
 */
export function getSelectedServer(def = false): string | null {
    return !def
        ? config?.selectedServer ?? null
        : DEFAULT_CONFIG.selectedServer;
}

/**
 * Set the ID of the selected serverpack.
 */
export function setSelectedServer(serverID: string | null | undefined): void {
    if (config) {
        config.selectedServer = serverID ?? null;
    } else {
        console.error("Cannot set selectedServer: config is not loaded.");
    }
}

/**
 * Get an array of each account currently authenticated by the launcher.
 */
export function getAuthAccounts(): { [uuid: string]: AuthAccount } {
    return config?.authenticationDatabase ?? {};
}

/**
 * Returns the authenticated account with the given uuid. Value may
 * be null.
 */
export function getAuthAccount(uuid: string): AuthAccount | undefined {
    if (config && config.authenticationDatabase) {
        return config.authenticationDatabase[uuid];
    }
    return undefined;
}

/**
 * Update the access token of an authenticated mojang account.
 */
export function updateMojangAuthAccount(
    uuid: string,
    accessToken: string
): AuthAccount | undefined {
    if (
        config &&
        config.authenticationDatabase &&
        config.authenticationDatabase[uuid]
    ) {
        config.authenticationDatabase[uuid].accessToken = accessToken;
        config.authenticationDatabase[uuid].type = "mojang"; // For gradual conversion.
        return config.authenticationDatabase[uuid];
    } else {
        console.error(
            "Cannot update Mojang Auth Account: config or authenticationDatabase is not loaded, or account does not exist."
        );
        return undefined;
    }
}

/**
 * Adds an authenticated mojang account to the database to be stored.
 */
export function addMojangAuthAccount(
    uuid: string | null | undefined,
    accessToken: string,
    username: string,
    displayName: string
): AuthAccount | undefined {
    if (!config) {
        console.error("Cannot add Mojang Auth Account: config is not loaded.");
        return undefined;
    }
    if (!config.authenticationDatabase) {
        config.authenticationDatabase = {};
    }
    if (typeof uuid !== "string" || uuid.trim() === "") {
        console.error(
            "Cannot add Mojang Auth Account: uuid is null, undefined, or empty."
        );
        return undefined;
    }
    config.selectedAccount = uuid;
    config.authenticationDatabase[uuid] = {
        type: "mojang",
        accessToken,
        username: username.trim(),
        uuid: uuid.trim(),
        displayName: displayName.trim(),
    };
    return config.authenticationDatabase[uuid];
}

/**
 * Update the tokens of an authenticated microsoft account.
 */
export function updateMicrosoftAuthAccount(
    uuid: string,
    accessToken: string,
    msAccessToken: string,
    msRefreshToken: string,
    msExpires: number | Date,
    mcExpires?: number | Date
): AuthAccount | undefined {
    if (
        config &&
        config.authenticationDatabase &&
        config.authenticationDatabase[uuid]
    ) {
        config.authenticationDatabase[uuid].accessToken = accessToken;
        if (mcExpires !== undefined) {
            config.authenticationDatabase[uuid].expiresAt =
                typeof mcExpires === "number" ? new Date(mcExpires) : mcExpires;
        }
        if (config.authenticationDatabase[uuid].microsoft) {
            config.authenticationDatabase[uuid].microsoft!.access_token =
                msAccessToken;
            config.authenticationDatabase[uuid].microsoft!.refresh_token =
                msRefreshToken;
            config.authenticationDatabase[uuid].microsoft!.expires_at =
                typeof msExpires === "number" ? new Date(msExpires) : msExpires;
        } else {
            config.authenticationDatabase[uuid].microsoft = {
                access_token: msAccessToken,
                refresh_token: msRefreshToken,
                expires_at:
                    typeof msExpires === "number"
                        ? new Date(msExpires)
                        : msExpires,
            };
        }
        return config.authenticationDatabase[uuid];
    } else {
        console.error(
            "Cannot update Microsoft Auth Account: config or authenticationDatabase is not loaded, or account does not exist."
        );
        return undefined;
    }
}

/**
 * Adds an authenticated microsoft account to the database to be stored.
 */
export function addMicrosoftAuthAccount(
    uuid: string | null | undefined,
    accessToken: string,
    name: string,
    mcExpires: Date,
    msAccessToken: string,
    msRefreshToken: string,
    msExpires: Date
): AuthAccount | undefined {
    if (!config) {
        console.error(
            "Cannot add Microsoft Auth Account: config is not loaded."
        );
        return undefined;
    }
    if (!config.authenticationDatabase) {
        config.authenticationDatabase = {};
    }
    if (typeof uuid !== "string" || uuid.trim() === "") {
        console.error(
            "Cannot add Microsoft Auth Account: uuid is null, undefined, or empty."
        );
        return undefined;
    }
    config.selectedAccount = uuid;
    config.authenticationDatabase[uuid] = {
        type: "microsoft",
        accessToken,
        username: name.trim(),
        uuid: uuid.trim(),
        displayName: name.trim(),
        expiresAt: mcExpires,
        microsoft: {
            access_token: msAccessToken,
            refresh_token: msRefreshToken,
            expires_at: msExpires,
        },
    };
    return config.authenticationDatabase[uuid];
}

/**
 * Remove an authenticated account from the database. If the account
 * was also the selected account, a new one will be selected. If there
 * are no accounts, the selected account will be null.
 */
export function removeAuthAccount(uuid: string | null | undefined): boolean {
    if (
        config &&
        config.authenticationDatabase &&
        typeof uuid === "string" &&
        uuid.trim() !== "" &&
        config.authenticationDatabase[uuid] != null
    ) {
        delete config.authenticationDatabase[uuid];
        if (config.selectedAccount === uuid) {
            const keys = Object.keys(config.authenticationDatabase);
            if (keys.length > 0) {
                config.selectedAccount = keys[0];
            } else {
                config.selectedAccount = null;
                config.clientToken = null;
            }
        }
        return true;
    }
    return false;
}

/**
 * Get the currently selected authenticated account.
 */
export function getSelectedAccount(): AuthAccount | undefined {
    if (
        config &&
        config.authenticationDatabase &&
        typeof config.selectedAccount === "string" &&
        config.selectedAccount.trim() !== ""
    ) {
        return config.authenticationDatabase[config.selectedAccount];
    }
    return undefined;
}

/**
 * Set the selected authenticated account.
 */
export function setSelectedAccount(
    uuid: string | null | undefined
): AuthAccount | undefined {
    if (
        config &&
        config.authenticationDatabase &&
        typeof uuid === "string" &&
        uuid.trim() !== ""
    ) {
        const authAcc = config.authenticationDatabase[uuid];
        if (authAcc != null) {
            config.selectedAccount = uuid;
        }
        return authAcc;
    }
    return undefined;
}

/**
 * Get an array of each mod configuration currently stored.
 */
export function getModConfigurations(): ModConfiguration[] {
    return config?.modConfigurations ?? [];
}

/**
 * Set the array of stored mod configurations.
 */
export function setModConfigurations(
    configurations: ModConfiguration[] | undefined
): void {
    if (config) {
        config.modConfigurations = configurations ?? [];
    } else {
        console.error("Cannot set modConfigurations: config is not loaded.");
    }
}

/**
 * Get the mod configuration for a specific server.
 */
export function getModConfiguration(serverid: string): ModConfiguration | null {
    if (!config || !config.modConfigurations) {
        return null;
    }
    const cfgs = config.modConfigurations;
    for (const cfg of cfgs) {
        if (cfg.id === serverid) {
            return cfg;
        }
    }
    return null;
}

/**
 * Set the mod configuration for a specific server. This overrides any existing value.
 */
export function setModConfiguration(
    serverid: string,
    configuration: ModConfiguration
): void {
    if (!config || !config.modConfigurations) {
        console.error(
            "Cannot set modConfiguration: config or modConfigurations is not loaded."
        );
        return;
    }
    const cfgs = config.modConfigurations;
    for (let i = 0; i < cfgs.length; i++) {
        if (cfgs[i].id === serverid) {
            cfgs[i] = configuration;
            return;
        }
    }
    cfgs.push(configuration);
}

// User Configurable Settings
// Java Settings

function defaultJavaConfig(
    effectiveJavaOptions: EffectiveJavaOptions,
    ram?: RamConfig
): JavaConfig {
    if (effectiveJavaOptions.suggestedMajor > 8) {
        return defaultJavaConfig17(ram);
    } else {
        return defaultJavaConfig8(ram);
    }
}

function defaultJavaConfig8(ram?: RamConfig): JavaConfig {
    return {
        minRAM: resolveSelectedRAM(ram),
        maxRAM: resolveSelectedRAM(ram),
        executable: null,
        jvmOptions: [
            "-XX:+UseConcMarkSweepGC",
            "-XX:+CMSIncrementalMode",
            "-XX:-UseAdaptiveSizePolicy",
            "-Xmn128M",
        ],
    };
}

function defaultJavaConfig17(ram?: RamConfig): JavaConfig {
    return {
        minRAM: resolveSelectedRAM(ram),
        maxRAM: resolveSelectedRAM(ram),
        executable: null,
        jvmOptions: [
            "-XX:+UnlockExperimentalVMOptions",
            "-XX:+UseG1GC",
            "-XX:G1NewSizePercent=20",
            "-XX:G1ReservePercent=20",
            "-XX:MaxGCPauseMillis=50",
            "-XX:G1HeapRegionSize=32M",
        ],
    };
}

/**
 * Ensure a java config property is set for the given server.
 */
export function ensureJavaConfig(
    serverid: string,
    effectiveJavaOptions: EffectiveJavaOptions,
    ram?: RamConfig
): void {
    if (!config) {
        console.error("Cannot ensure Java config: config is not loaded.");
        return;
    }
    if (!config.javaConfig) {
        config.javaConfig = {};
    }
    if (!Object.prototype.hasOwnProperty.call(config.javaConfig, serverid)) {
        config.javaConfig[serverid] = defaultJavaConfig(
            effectiveJavaOptions,
            ram
        );
    }
}

/**
 * Retrieve the minimum amount of memory for JVM initialization. This value
 * contains the units of memory. For example, '5G' = 5 GigaBytes, '1024M' =
 * 1024 MegaBytes, etc.
 */
export function getMinRAM(serverid: string): string | undefined {
    if (config && config.javaConfig && config.javaConfig[serverid]) {
        return config.javaConfig[serverid].minRAM;
    }
    return undefined;
}

/**
 * Set the minimum amount of memory for JVM initialization. This value should
 * contain the units of memory. For example, '5G' = 5 GigaBytes, '1024M' =
 * 1024 MegaBytes, etc.
 */
export function setMinRAM(serverid: string, minRAM: string): void {
    if (config && config.javaConfig && config.javaConfig[serverid]) {
        config.javaConfig[serverid].minRAM = minRAM;
    } else {
        console.error("Cannot set minRAM: config or javaConfig is not loaded.");
    }
}

/**
 * Retrieve the maximum amount of memory for JVM initialization. This value
 * contains the units of memory. For example, '5G' = 5 GigaBytes, '1024M' =
 * 1024 MegaBytes, etc.
 */
export function getMaxRAM(serverid: string): string | undefined {
    if (config && config.javaConfig && config.javaConfig[serverid]) {
        return config.javaConfig[serverid].maxRAM;
    }
    return undefined;
}

/**
 * Set the maximum amount of memory for JVM initialization. This value should
 * contain the units of memory. For example, '5G' = 5 GigaBytes, '1024M' =
 * 1024 MegaBytes, etc.
 */
export function setMaxRAM(serverid: string, maxRAM: string): void {
    if (config && config.javaConfig && config.javaConfig[serverid]) {
        config.javaConfig[serverid].maxRAM = maxRAM;
    } else {
        console.error("Cannot set maxRAM: config or javaConfig is not loaded.");
    }
}

/**
 * Retrieve the path of the Java Executable.
 *
 * This is a resolved configuration value and defaults to null until externally assigned.
 */
export function getJavaExecutable(serverid: string): string | null | undefined {
    if (config && config.javaConfig && config.javaConfig[serverid]) {
        return config.javaConfig[serverid].executable;
    }
    return undefined;
}

/**
 * Set the path of the Java Executable.
 */
export function setJavaExecutable(
    serverid: string,
    executable: string | null
): void {
    if (config && config.javaConfig && config.javaConfig[serverid]) {
        config.javaConfig[serverid].executable = executable;
    } else {
        console.error(
            "Cannot set Java executable: config or javaConfig is not loaded."
        );
    }
}

/**
 * Retrieve the additional arguments for JVM initialization. Required arguments,
 * such as memory allocation, will be dynamically resolved and will not be included
 * in this value.
 */
export function getJVMOptions(serverid: string): string[] | undefined {
    if (config && config.javaConfig && config.javaConfig[serverid]) {
        return config.javaConfig[serverid].jvmOptions;
    }
    return undefined;
}

/**
 * Set the additional arguments for JVM initialization. Required arguments,
 * such as memory allocation, will be dynamically resolved and should not be
 * included in this value.
 */
export function setJVMOptions(serverid: string, jvmOptions: string[]): void {
    if (config && config.javaConfig && config.javaConfig[serverid]) {
        config.javaConfig[serverid].jvmOptions = jvmOptions;
    } else {
        console.error(
            "Cannot set JVM options: config or javaConfig is not loaded."
        );
    }
}

// Game Settings

/**
 * Retrieve the width of the game window.
 */
export function getGameWidth(def = false): number {
    return !def
        ? config?.settings?.game?.resWidth ??
              DEFAULT_CONFIG.settings.game.resWidth
        : DEFAULT_CONFIG.settings.game.resWidth;
}

/**
 * Set the width of the game window.
 */
export function setGameWidth(resWidth: string): void {
    if (config && config.settings && config.settings.game) {
        config.settings.game.resWidth = Number.parseInt(resWidth);
    } else {
        console.error(
            "Cannot set game width: config, settings, or game is not loaded."
        );
    }
}

/**
 * Validate a potential new width value.
 */
export function validateGameWidth(resWidth: string): boolean {
    const nVal = Number.parseInt(resWidth);
    return Number.isInteger(nVal) && nVal >= 0;
}

/**
 * Retrieve the height of the game window.
 */
export function getGameHeight(def = false): number {
    return !def
        ? config?.settings?.game?.resHeight ??
              DEFAULT_CONFIG.settings.game.resHeight
        : DEFAULT_CONFIG.settings.game.resHeight;
}

/**
 * Set the height of the game window.
 */
export function setGameHeight(resHeight: string): void {
    if (config && config.settings && config.settings.game) {
        config.settings.game.resHeight = Number.parseInt(resHeight);
    } else {
        console.error(
            "Cannot set game height: config, settings, or game is not loaded."
        );
    }
}

/**
 * Validate a potential new height value.
 */
export function validateGameHeight(resHeight: string): boolean {
    const nVal = Number.parseInt(resHeight);
    return Number.isInteger(nVal) && nVal >= 0;
}

/**
 * Check if the game should be launched in fullscreen mode.
 */
export function getFullscreen(def = false): boolean {
    return !def
        ? config?.settings?.game?.fullscreen ??
              DEFAULT_CONFIG.settings.game.fullscreen
        : DEFAULT_CONFIG.settings.game.fullscreen;
}

/**
 * Change the status of if the game should be launched in fullscreen mode.
 */
export function setFullscreen(fullscreen: boolean | undefined): void {
    if (config && config.settings && config.settings.game) {
        config.settings.game.fullscreen = fullscreen ?? false;
    } else {
        console.error(
            "Cannot set fullscreen: config, settings, or game is not loaded."
        );
    }
}

/**
 * Check if the game should auto connect to servers.
 */
export function getAutoConnect(def = false): boolean {
    return !def
        ? config?.settings?.game?.autoConnect ??
              DEFAULT_CONFIG.settings.game.autoConnect
        : DEFAULT_CONFIG.settings.game.autoConnect;
}

/**
 * Change the status of whether or not the game should auto connect to servers.
 */
export function setAutoConnect(autoConnect: boolean | undefined): void {
    if (config && config.settings && config.settings.game) {
        config.settings.game.autoConnect = autoConnect ?? true;
    } else {
        console.error(
            "Cannot set autoConnect: config, settings, or game is not loaded."
        );
    }
}

/**
 * Check if the game should launch as a detached process.
 */
export function getLaunchDetached(def = false): boolean {
    return !def
        ? config?.settings?.game?.launchDetached ??
              DEFAULT_CONFIG.settings.game.launchDetached
        : DEFAULT_CONFIG.settings.game.launchDetached;
}

/**
 * Change the status of whether or not the game should launch as a detached process.
 */
export function setLaunchDetached(launchDetached: boolean | undefined): void {
    if (config && config.settings && config.settings.game) {
        config.settings.game.launchDetached = launchDetached ?? true;
    } else {
        console.error(
            "Cannot set launchDetached: config, settings, or game is not loaded."
        );
    }
}

// Launcher Settings

/**
 * Check if the launcher should download prerelease versions.
 */
export function getAllowPrerelease(def = false): boolean {
    return !def
        ? config?.settings?.launcher?.allowPrerelease ??
              DEFAULT_CONFIG.settings.launcher.allowPrerelease
        : DEFAULT_CONFIG.settings.launcher.allowPrerelease;
}

/**
 * Change the status of Whether or not the launcher should download prerelease versions.
 */
export function setAllowPrerelease(allowPrerelease: boolean | undefined): void {
    if (config && config.settings && config.settings.launcher) {
        config.settings.launcher.allowPrerelease = allowPrerelease ?? false;
    } else {
        console.error(
            "Cannot set allowPrerelease: config, settings, or launcher is not loaded."
        );
    }
}

export function ensureJavaSettings(data: DistributionData): void {
    if (!config) {
        console.error("Cannot ensure Java settings: config is not loaded.");
        return;
    }

    // Nothing too fancy for now.
    for (const serv of data.servers) {
        ensureJavaConfig(
            serv.rawServer.id,
            serv.effectiveJavaOptions,
            serv.rawServer.javaOptions?.ram
        );
    }

    save();
}

function scanOptionalSubModules(
    mdls: ModuleData[] | null | undefined,
    origin: ModuleData
): ModConfiguration | boolean {
    if (mdls != null) {
        const mods: ModConfigurationMap = {};

        for (const mdl of mdls) {
            const type = mdl.rawModule.type;
            // Optional types.
            if (
                type === Type.ForgeMod ||
                type === Type.LiteMod ||
                type === Type.LiteLoader ||
                type === Type.FabricMod
            ) {
                // It is optional.
                if (!mdl.getRequired().value) {
                    mods[mdl.getVersionlessMavenIdentifier()] =
                        scanOptionalSubModules(mdl.subModules, mdl);
                } else {
                    if (mdl.hasSubModules && mdl.hasSubModules()) {
                        const v = scanOptionalSubModules(mdl.subModules, mdl);
                        if (typeof v === "object") {
                            mods[mdl.getVersionlessMavenIdentifier()] = v;
                        }
                    }
                }
            }
        }

        if (Object.keys(mods).length > 0) {
            const ret: ModConfiguration = {
                id: origin.getVersionlessMavenIdentifier(),
                mods,
            };
            if (!origin.getRequired().value) {
                ret.value = origin.getRequired().def ?? true;
            }
            return ret;
        }
    }
    return origin.getRequired().def ?? true;
}

function mergeModConfiguration(
    o: ModConfiguration | boolean,
    n: ModConfiguration | boolean,
    nReq = false
): ModConfiguration | boolean {
    if (typeof o === "boolean") {
        if (typeof n === "boolean") return o;
        else if (typeof n === "object") {
            if (!nReq) {
                n.value = o;
            }
            return n;
        }
    } else if (typeof o === "object") {
        if (typeof n === "boolean")
            return typeof o.value !== "undefined" ? o.value : true;
        else if (typeof n === "object") {
            if (!nReq) {
                n.value = typeof o.value !== "undefined" ? o.value : true;
            }

            if (o.mods && n.mods) {
                const newMods = Object.keys(n.mods);
                for (const mod of newMods) {
                    if (o.mods[mod] != null) {
                        n.mods[mod] = mergeModConfiguration(
                            o.mods[mod],
                            n.mods[mod]
                        );
                    }
                }
            }

            return n;
        }
    }
    // If for some reason we haven't been able to merge,
    // wipe the old value and use the new one. Just to be safe
    return n;
}

export function syncModConfigurations(data: DistributionData): void {
    const syncedCfgs: ModConfiguration[] = [];

    for (const serv of data.servers) {
        const id = serv.rawServer.id;
        const mdls = serv.modules;
        const cfg = getModConfiguration(id);

        if (cfg != null) {
            const modsOld = cfg.mods;
            const mods: ModConfigurationMap = {};

            // Type guard: ensure modsOld is an object
            const modsOldObj =
                modsOld && typeof modsOld === "object" ? modsOld : {};

            for (const mdl of mdls) {
                const type = mdl.rawModule.type;

                if (
                    type === Type.ForgeMod ||
                    type === Type.LiteMod ||
                    type === Type.LiteLoader ||
                    type === Type.FabricMod
                ) {
                    if (!mdl.getRequired().value) {
                        const mdlID = mdl.getVersionlessMavenIdentifier();
                        if (modsOldObj[mdlID] == null) {
                            mods[mdlID] = scanOptionalSubModules(
                                mdl.subModules,
                                mdl
                            );
                        } else {
                            mods[mdlID] = mergeModConfiguration(
                                modsOldObj[mdlID],
                                scanOptionalSubModules(mdl.subModules, mdl),
                                false
                            );
                        }
                    } else {
                        if (mdl.subModules.length > 0) {
                            const mdlID = mdl.getVersionlessMavenIdentifier();
                            const v = scanOptionalSubModules(
                                mdl.subModules,
                                mdl
                            );
                            if (typeof v === "object") {
                                if (modsOldObj[mdlID] == null) {
                                    mods[mdlID] = v;
                                } else {
                                    mods[mdlID] = mergeModConfiguration(
                                        modsOldObj[mdlID],
                                        v,
                                        true
                                    );
                                }
                            }
                        }
                    }
                }
            }

            syncedCfgs.push({
                id,
                mods,
            });
        } else {
            const mods: ModConfigurationMap = {};

            for (const mdl of mdls) {
                const type = mdl.rawModule.type;
                if (
                    type === Type.ForgeMod ||
                    type === Type.LiteMod ||
                    type === Type.LiteLoader ||
                    type === Type.FabricMod
                ) {
                    if (!mdl.getRequired().value) {
                        mods[mdl.getVersionlessMavenIdentifier()] =
                            scanOptionalSubModules(mdl.subModules, mdl);
                    } else {
                        if (mdl.subModules.length > 0) {
                            const v = scanOptionalSubModules(
                                mdl.subModules,
                                mdl
                            );
                            if (typeof v === "object") {
                                mods[mdl.getVersionlessMavenIdentifier()] = v;
                            }
                        }
                    }
                }
            }

            syncedCfgs.push({
                id,
                mods,
            });
        }
    }

    setModConfigurations(syncedCfgs);
    save();
}
