import AdmZip from "adm-zip";
import child_process, { ChildProcess } from "child_process";
import crypto from "crypto";
import fs from "fs-extra";
import {
    getMojangOS,
    isLibraryCompatible,
    mcVersionAtLeast,
    HeliosModule as PhyloriaModule,
    HeliosServer as PhyloriaServer,
} from "helios-core/common";
import { Type } from "helios-distribution-types";
import os from "os";
import path from "path";

import * as ConfigManager from "./configmanager";

type AuthUser = {
    displayName: string;
    uuid: string;
    accessToken: string;
    type: "mojang" | "microsoft";
};

export interface VanillaManifest {
    id: string;
    assets: string;
    type: string;
    libraries: LibraryEntry[];
    arguments: {
        jvm: (string | ArgumentRule)[];
        game: (string | ArgumentRule)[];
    };
    [key: string]: unknown;
}

export interface LibraryEntry {
    name: string;
    rules?: Rule[];
    natives?: Record<string, string>;
    downloads: {
        artifact?: {
            path: string;
            url: string;
            sha1: string;
            size: number;
        };
        classifiers?: Record<
            string,
            {
                path: string;
                url: string;
                sha1: string;
                size: number;
            }
        >;
    };
    extract?: {
        exclude: string[];
    };
}

export interface Rule {
    action: "allow" | "disallow";
    os?: {
        name: string;
        version?: string;
    };
    features?: {
        has_custom_resolution?: boolean;
    };
}

interface ArgumentRule {
    rules: Rule[];
    value: string | string[];
}

interface ModManifest {
    id: string;
    mainClass: string;
    arguments?: {
        jvm?: string[];
        game: string[];
    };
    minecraftArguments?: string;
    [key: string]: unknown;
}

interface ModConfiguration {
    [key: string]:
        | {
              value?: boolean;
              mods?: ModConfiguration;
          }
        | boolean;
}

interface ResolvedMods {
    fMods: PhyloriaModule[];
    lMods: PhyloriaModule[];
}

interface ModList {
    repositoryRoot: string;
    modRef: string[];
}

interface LibraryMap {
    [versionIndependentId: string]: string;
}

/**
 * Only forge and fabric are top level mod loaders.
 *
 * Forge 1.13+ launch logic is similar to fabrics, for now using usingFabricLoader flag to
 * change minor details when needed.
 *
 * Rewrite of this module may be needed in the future.
 */
export class ProcessBuilder {
    gameDir: string;
    commonDir: string;
    server: PhyloriaServer;
    vanillaManifest: VanillaManifest;
    modManifest: ModManifest;
    authUser: AuthUser;
    launcherVersion: string;
    forgeModListFile: string;
    fmlDir: string;
    llDir: string;
    libPath: string;
    usingLiteLoader: boolean;
    usingFabricLoader: boolean;
    llPath: string | null;

    constructor(
        distroServer: PhyloriaServer,
        vanillaManifest: VanillaManifest,
        modManifest: ModManifest,
        authUser: AuthUser,
        launcherVersion: string
    ) {
        this.gameDir = path.join(
            ConfigManager.getInstanceDirectory(),
            distroServer.rawServer.id
        );
        this.commonDir = ConfigManager.getCommonDirectory();
        this.server = distroServer;
        this.vanillaManifest = vanillaManifest;
        this.modManifest = modManifest;
        this.authUser = authUser;
        this.launcherVersion = launcherVersion;
        this.forgeModListFile = path.join(this.gameDir, "forgeMods.list"); // 1.13+
        this.fmlDir = path.join(this.gameDir, "forgeModList.json");
        this.llDir = path.join(this.gameDir, "liteloaderModList.json");
        this.libPath = path.join(this.commonDir, "libraries");

        this.usingLiteLoader = false;
        this.usingFabricLoader = false;
        this.llPath = null;
    }

    /**
     * Convenience method to run the functions typically used to build a process.
     */
    build(): ChildProcess {
        fs.ensureDirSync(this.gameDir);
        const tempNativePath = path.join(
            os.tmpdir(),
            ConfigManager.getTempNativeFolder(),
            crypto.pseudoRandomBytes(16).toString("hex")
        );
        process.throwDeprecation = true;
        this.setupLiteLoader();
        console.info("Using liteloader:", this.usingLiteLoader);
        this.usingFabricLoader = this.server.modules.some(
            (mdl) => mdl.rawModule.type === Type.Fabric
        );
        console.info("Using fabric loader:", this.usingFabricLoader);
        const modObj = this.resolveModConfiguration(
            ConfigManager.getModConfiguration(this.server.rawServer.id)?.mods ??
                {},
            this.server.modules
        );

        // Mod list below 1.13
        // Fabric only supports 1.14+
        if (!mcVersionAtLeast("1.13", this.server.rawServer.minecraftVersion)) {
            this.constructJSONModList("forge", modObj.fMods, true);
            if (this.usingLiteLoader) {
                this.constructJSONModList("liteloader", modObj.lMods, true);
            }
        }

        const uberModArr = modObj.fMods.concat(modObj.lMods);
        let args = this.constructJVMArguments(uberModArr, tempNativePath);

        if (mcVersionAtLeast("1.13", this.server.rawServer.minecraftVersion)) {
            //args = args.concat(this.constructModArguments(modObj.fMods))
            args = args.concat(this.constructModList(modObj.fMods));
        }

        // Hide access token
        const loggableArgs = [...args];
        loggableArgs[
            loggableArgs.findIndex((x) => x === this.authUser.accessToken)
        ] = "**********";

        console.info("Launch Arguments:", loggableArgs);

        const javaExecutable =
            ConfigManager.getJavaExecutable(this.server.rawServer.id) ?? "java";
        const child = child_process.spawn(javaExecutable, args, {
            cwd: this.gameDir,
            detached: ConfigManager.getLaunchDetached(),
        });

        if (ConfigManager.getLaunchDetached()) {
            child.unref();
        }

        child.stdout?.setEncoding("utf8");
        child.stderr?.setEncoding("utf8");

        child.stdout?.on("data", (data: string) => {
            data.trim()
                .split("\n")
                .forEach((x: string) =>
                    console.log(`\x1b[32m[Minecraft]\x1b[0m ${x}`)
                );
        });
        child.stderr?.on("data", (data: string) => {
            data.trim()
                .split("\n")
                .forEach((x: string) =>
                    console.log(`\x1b[31m[Minecraft]\x1b[0m ${x}`)
                );
        });
        child.on("close", (code: number | null) => {
            console.info("Exited with code", code);
            fs.remove(tempNativePath, (err?: Error) => {
                if (err) {
                    console.warn("Error while deleting temp dir", err);
                } else {
                    console.info("Temp dir deleted successfully.");
                }
            });
        });

        return child;
    }

    /**
     * Get the platform specific classpath separator. On windows, this is a semicolon.
     * On Unix, this is a colon.
     *
     * @returns The classpath separator for the current operating system.
     */
    static getClasspathSeparator(): string {
        return process.platform === "win32" ? ";" : ":";
    }

    /**
     * Determine if an optional mod is enabled from its configuration value. If the
     * configuration value is null, the required object will be used to
     * determine if it is enabled.
     *
     * A mod is enabled if:
     *   * The configuration is not null and one of the following:
     *     * The configuration is a boolean and true.
     *     * The configuration is an object and its 'value' property is true.
     *   * The configuration is null and one of the following:
     *     * The required object is null.
     *     * The required object's 'def' property is null or true.
     *
     * @param modCfg The mod configuration object.
     * @param required Optional. The required object from the mod's distro declaration.
     * @returns True if the mod is enabled, false otherwise.
     */
    static isModEnabled(
        modCfg: { value: boolean } | boolean | null,
        required: { def?: boolean } | null = null
    ): boolean {
        return modCfg != null
            ? (typeof modCfg === "boolean" && modCfg) ||
                  (typeof modCfg === "object" &&
                      (typeof modCfg.value !== "undefined"
                          ? modCfg.value
                          : true))
            : required != null
            ? required.def ?? true
            : true;
    }

    /**
     * Function which performs a preliminary scan of the top level
     * mods. If liteloader is present here, we setup the special liteloader
     * launch options. Note that liteloader is only allowed as a top level
     * mod. It must not be declared as a submodule.
     */
    setupLiteLoader(): void {
        for (const ll of this.server.modules) {
            if (ll.rawModule.type === Type.LiteLoader) {
                if (!ll.getRequired().value) {
                    const modConfigResult = ConfigManager.getModConfiguration(
                        this.server.rawServer.id
                    );
                    if (modConfigResult?.mods) {
                        const modEntry =
                            modConfigResult.mods[
                                ll.getVersionlessMavenIdentifier()
                            ];
                        // Convert ModConfiguration to the expected format for isModEnabled
                        const modCfgForCheck:
                            | { value: boolean }
                            | boolean
                            | null =
                            typeof modEntry === "object" &&
                            modEntry !== null &&
                            "id" in modEntry
                                ? { value: modEntry.value ?? true }
                                : modEntry || null;

                        if (
                            ProcessBuilder.isModEnabled(
                                modCfgForCheck,
                                ll.getRequired()
                            )
                        ) {
                            if (fs.existsSync(ll.getPath())) {
                                this.usingLiteLoader = true;
                                this.llPath = ll.getPath();
                            }
                        }
                    }
                } else {
                    if (fs.existsSync(ll.getPath())) {
                        this.usingLiteLoader = true;
                        this.llPath = ll.getPath();
                    }
                }
            }
        }
    }

    /**
     * Resolve an array of all enabled mods. These mods will be constructed into
     * a mod list format and enabled at launch.
     *
     * @param modCfg The mod configuration object.
     * @param mdls An array of modules to parse.
     * @returns An object which contains a list of enabled forge mods and litemods.
     */
    resolveModConfiguration(
        modCfg: ModConfiguration,
        mdls: PhyloriaModule[]
    ): ResolvedMods {
        let fMods: PhyloriaModule[] = [];
        let lMods: PhyloriaModule[] = [];

        for (const mdl of mdls) {
            const type = mdl.rawModule.type;
            if (
                type === Type.ForgeMod ||
                type === Type.LiteMod ||
                type === Type.LiteLoader ||
                type === Type.FabricMod
            ) {
                const o = !mdl.getRequired().value;
                // Normalize modCfg to match isModEnabled expected type
                const rawModCfg = modCfg[mdl.getVersionlessMavenIdentifier()];
                let normalizedModCfg: { value: boolean } | boolean | null;
                if (
                    typeof rawModCfg === "object" &&
                    rawModCfg !== null &&
                    "value" in rawModCfg
                ) {
                    normalizedModCfg = { value: rawModCfg.value ?? true };
                } else if (typeof rawModCfg === "boolean") {
                    normalizedModCfg = rawModCfg;
                } else {
                    normalizedModCfg = null;
                }
                const e = ProcessBuilder.isModEnabled(
                    normalizedModCfg,
                    mdl.getRequired()
                );
                if (!o || (o && e)) {
                    if (mdl.subModules.length > 0) {
                        const subModCfg =
                            modCfg[mdl.getVersionlessMavenIdentifier()];
                        const subMods =
                            typeof subModCfg === "object" &&
                            subModCfg !== null &&
                            "mods" in subModCfg
                                ? subModCfg.mods || {}
                                : {};
                        const v = this.resolveModConfiguration(
                            subMods,
                            mdl.subModules
                        );
                        fMods = fMods.concat(v.fMods);
                        lMods = lMods.concat(v.lMods);
                        if (type === Type.LiteLoader) {
                            continue;
                        }
                    }
                    if (type === Type.ForgeMod || type === Type.FabricMod) {
                        fMods.push(mdl);
                    } else {
                        lMods.push(mdl);
                    }
                }
            }
        }

        return {
            fMods,
            lMods,
        };
    }

    private _lteMinorVersion(version: number): boolean {
        return (
            Number(this.modManifest.id.split("-")[0].split(".")[1]) <= version
        );
    }

    /**
     * Test to see if this version of forge requires the absolute: prefix
     * on the modListFile repository field.
     */
    private _requiresAbsolute(): boolean {
        try {
            if (this._lteMinorVersion(9)) {
                return false;
            }
            const ver = this.modManifest.id.split("-")[2];
            const pts = ver.split(".");
            const min = [14, 23, 3, 2655];
            for (let i = 0; i < pts.length; i++) {
                const parsed = Number.parseInt(pts[i]);
                if (parsed < min[i]) {
                    return false;
                } else if (parsed > min[i]) {
                    return true;
                }
            }
        } catch (err) {
            // We know old forge versions follow this format.
            // Error must be caused by newer version.
        }

        // Equal or errored
        return true;
    }

    /**
     * Construct a mod list json object.
     *
     * @param type The mod list type to construct.
     * @param mods An array of mods to add to the mod list.
     * @param save Optional. Whether or not we should save the mod list file.
     */
    constructJSONModList(
        type: "forge" | "liteloader",
        mods: PhyloriaModule[],
        save = false
    ): ModList {
        const modList: ModList = {
            repositoryRoot:
                (type === "forge" && this._requiresAbsolute()
                    ? "absolute:"
                    : "") + path.join(this.commonDir, "modstore"),
            modRef: [],
        };

        const ids: string[] = [];
        if (type === "forge") {
            for (const mod of mods) {
                ids.push(mod.getExtensionlessMavenIdentifier());
            }
        } else {
            for (const mod of mods) {
                ids.push(mod.getMavenIdentifier());
            }
        }
        modList.modRef = ids;

        if (save) {
            const json = JSON.stringify(modList, null, 4);
            fs.writeFileSync(
                type === "forge" ? this.fmlDir : this.llDir,
                json,
                "utf-8"
            );
        }

        return modList;
    }

    /**
     * Construct the mod argument list for forge 1.13 and Fabric
     *
     * @param mods An array of mods to add to the mod list.
     */
    constructModList(mods: PhyloriaModule[]): string[] {
        const writeBuffer = mods
            .map((mod) => {
                return this.usingFabricLoader
                    ? mod.getPath()
                    : mod.getExtensionlessMavenIdentifier();
            })
            .join("\n");

        if (writeBuffer) {
            fs.writeFileSync(this.forgeModListFile, writeBuffer, "utf-8");
            return this.usingFabricLoader
                ? ["--fabric.addMods", `@${this.forgeModListFile}`]
                : [
                      "--fml.mavenRoots",
                      path.join("..", "..", "common", "modstore"),
                      "--fml.modLists",
                      this.forgeModListFile,
                  ];
        } else {
            return [];
        }
    }

    private _processAutoConnectArg(args: (string | number)[]): void {
        if (
            ConfigManager.getAutoConnect() &&
            this.server.rawServer.autoconnect
        ) {
            if (
                mcVersionAtLeast("1.20", this.server.rawServer.minecraftVersion)
            ) {
                args.push("--quickPlayMultiplayer");
                args.push(`${this.server.hostname}:${this.server.port}`);
            } else {
                args.push("--server");
                args.push(this.server.hostname);
                args.push("--port");
                args.push(this.server.port.toString());
            }
        }
    }

    /**
     * Construct the argument array that will be passed to the JVM process.
     *
     * @param mods An array of enabled mods which will be launched with this process.
     * @param tempNativePath The path to store the native libraries.
     * @returns An array containing the full JVM arguments for this process.
     */
    constructJVMArguments(
        mods: PhyloriaModule[],
        tempNativePath: string
    ): string[] {
        if (mcVersionAtLeast("1.13", this.server.rawServer.minecraftVersion)) {
            return this._constructJVMArguments113(mods, tempNativePath);
        } else {
            return this._constructJVMArguments112(mods, tempNativePath);
        }
    }

    /**
     * Construct the argument array that will be passed to the JVM process.
     * This function is for 1.12 and below.
     *
     * @param mods An array of enabled mods which will be launched with this process.
     * @param tempNativePath The path to store the native libraries.
     * @returns An array containing the full JVM arguments for this process.
     */
    private _constructJVMArguments112(
        mods: PhyloriaModule[],
        tempNativePath: string
    ): string[] {
        let args: string[] = [];

        // Classpath Argument
        args.push("-cp");
        args.push(
            this.classpathArg(mods, tempNativePath).join(
                ProcessBuilder.getClasspathSeparator()
            )
        );

        // Java Arguments
        if (process.platform === "darwin") {
            args.push("-Xdock:name=PhyloriaLauncher");
            args.push(
                "-Xdock:icon=" +
                    path.join(__dirname, "..", "images", "minecraft.icns")
            );
        }
        args.push("-Xmx" + ConfigManager.getMaxRAM(this.server.rawServer.id));
        args.push("-Xms" + ConfigManager.getMinRAM(this.server.rawServer.id));
        args = args.concat(
            ConfigManager.getJVMOptions(this.server.rawServer.id) ?? []
        );
        args.push("-Djava.library.path=" + tempNativePath);

        // Main Java Class
        args.push(this.modManifest.mainClass);

        // Forge Arguments
        args = args.concat(this._resolveForgeArgs());

        return args;
    }

    /**
     * Construct the argument array that will be passed to the JVM process.
     * This function is for 1.13+
     *
     * Note: Required Libs https://github.com/MinecraftForge/MinecraftForge/blob/af98088d04186452cb364280340124dfd4766a5c/src/fmllauncher/java/net/minecraftforge/fml/loading/LibraryFinder.java#L82
     *
     * @param mods An array of enabled mods which will be launched with this process.
     * @param tempNativePath The path to store the native libraries.
     * @returns An array containing the full JVM arguments for this process.
     */
    private _constructJVMArguments113(
        mods: PhyloriaModule[],
        tempNativePath: string
    ): string[] {
        const argDiscovery = /\${*(.*)}/;

        // JVM Arguments First
        let args: (string | number | ArgumentRule)[] = [
            ...this.vanillaManifest.arguments.jvm,
        ];

        // Debug securejarhandler
        // args.push('-Dbsl.debug=true')

        if (this.modManifest.arguments?.jvm != null) {
            for (const argStr of this.modManifest.arguments.jvm) {
                args.push(
                    argStr
                        .replace(/\$\{library_directory\}/g, this.libPath)
                        .replace(
                            /\$\{classpath_separator\}/g,
                            ProcessBuilder.getClasspathSeparator()
                        )
                        .replace(/\$\{version_name\}/g, this.modManifest.id)
                );
            }
        }

        //args.push('-Dlog4j.configurationFile=D:\\WesterosCraft\\game\\common\\assets\\log_configs\\client-1.12.xml')

        // Java Arguments
        if (process.platform === "darwin") {
            args.push("-Xdock:name=PhyloriaLauncher");
            args.push(
                "-Xdock:icon=" +
                    path.join(__dirname, "..", "images", "minecraft.icns")
            );
        }
        args.push("-Xmx" + ConfigManager.getMaxRAM(this.server.rawServer.id));
        args.push("-Xms" + ConfigManager.getMinRAM(this.server.rawServer.id));
        args = args.concat(
            ConfigManager.getJVMOptions(this.server.rawServer.id) ?? []
        );

        // Main Java Class
        args.push(this.modManifest.mainClass);

        // Vanilla Arguments
        args = args.concat(this.vanillaManifest.arguments.game);

        for (let i = 0; i < args.length; i++) {
            const currentArg = args[i];
            if (
                typeof currentArg === "object" &&
                currentArg != null &&
                "rules" in currentArg
            ) {
                const argRule = currentArg as ArgumentRule;
                let checksum = 0;
                for (const rule of argRule.rules) {
                    if (rule.os != null) {
                        if (
                            rule.os.name === getMojangOS() &&
                            (rule.os.version == null ||
                                new RegExp(rule.os.version).test(os.release()))
                        ) {
                            if (rule.action === "allow") {
                                checksum++;
                            }
                        } else {
                            if (rule.action === "disallow") {
                                checksum++;
                            }
                        }
                    } else if (rule.features != null) {
                        // We don't have many 'features' in the index at the moment.
                        // This should be fine for a while.
                        if (
                            rule.features.has_custom_resolution != null &&
                            rule.features.has_custom_resolution === true
                        ) {
                            if (ConfigManager.getFullscreen()) {
                                argRule.value = ["--fullscreen", "true"];
                            }
                            checksum++;
                        }
                    }
                }

                // TODO splice not push
                if (checksum === argRule.rules.length) {
                    if (typeof argRule.value === "string") {
                        args[i] = argRule.value;
                    } else if (Array.isArray(argRule.value)) {
                        //args = args.concat(args[i].value)
                        args.splice(i, 1, ...argRule.value);
                    }

                    // Decrement i to reprocess the resolved value
                    i--;
                } else {
                    args[i] = "";
                }
            } else if (typeof currentArg === "string") {
                if (argDiscovery.test(currentArg)) {
                    const match = currentArg.match(argDiscovery);
                    const identifier = match ? match[1] : "";
                    let val: string | null = null;
                    switch (identifier) {
                        case "auth_player_name":
                            val = this.authUser.displayName.trim();
                            break;
                        case "version_name":
                            //val = vanillaManifest.id
                            val = this.server.rawServer.id;
                            break;
                        case "game_directory":
                            val = this.gameDir;
                            break;
                        case "assets_root":
                            val = path.join(this.commonDir, "assets");
                            break;
                        case "assets_index_name":
                            val = this.vanillaManifest.assets;
                            break;
                        case "auth_uuid":
                            val = this.authUser.uuid.trim();
                            break;
                        case "auth_access_token":
                            val = this.authUser.accessToken;
                            break;
                        case "user_type":
                            val =
                                this.authUser.type === "microsoft"
                                    ? "msa"
                                    : "mojang";
                            break;
                        case "version_type":
                            val = this.vanillaManifest.type;
                            break;
                        case "resolution_width":
                            val = ConfigManager.getGameWidth().toString();
                            break;
                        case "resolution_height":
                            val = ConfigManager.getGameHeight().toString();
                            break;
                        case "natives_directory":
                            val = currentArg.replace(
                                argDiscovery,
                                tempNativePath
                            );
                            break;
                        case "launcher_name":
                            val = currentArg.replace(
                                argDiscovery,
                                "Phyloria-Launcher"
                            );
                            break;
                        case "launcher_version":
                            val = currentArg.replace(
                                argDiscovery,
                                this.launcherVersion
                            );
                            break;
                        case "classpath":
                            val = this.classpathArg(mods, tempNativePath).join(
                                ProcessBuilder.getClasspathSeparator()
                            );
                            break;
                    }
                    if (val != null) {
                        args[i] = val;
                    }
                }
            }
        }

        // Autoconnect
        this._processAutoConnectArg(
            args.filter(
                (arg): arg is string | number =>
                    typeof arg === "string" || typeof arg === "number"
            )
        );

        // Forge Specific Arguments
        args = args.concat(this.modManifest.arguments?.game || []);

        // Filter null values
        const filteredArgs = args.filter((arg): arg is string | number => {
            return arg != null;
        });

        return filteredArgs.map((arg) => arg.toString());
    }

    /**
     * Resolve the arguments required by forge.
     *
     * @returns An array containing the arguments required by forge.
     */
    private _resolveForgeArgs(): string[] {
        if (!this.modManifest.minecraftArguments) {
            return [];
        }

        const mcArgs = this.modManifest.minecraftArguments.split(" ");
        const argDiscovery = /\${*(.*)}/;

        // Replace the declared variables with their proper values.
        for (let i = 0; i < mcArgs.length; ++i) {
            if (argDiscovery.test(mcArgs[i])) {
                const match = mcArgs[i].match(argDiscovery);
                const identifier = match ? match[1] : "";
                let val: string | null = null;
                switch (identifier) {
                    case "auth_player_name":
                        val = this.authUser.displayName.trim();
                        break;
                    case "version_name":
                        //val = vanillaManifest.id
                        val = this.server.rawServer.id;
                        break;
                    case "game_directory":
                        val = this.gameDir;
                        break;
                    case "assets_root":
                        val = path.join(this.commonDir, "assets");
                        break;
                    case "assets_index_name":
                        val = this.vanillaManifest.assets;
                        break;
                    case "auth_uuid":
                        val = this.authUser.uuid.trim();
                        break;
                    case "auth_access_token":
                        val = this.authUser.accessToken;
                        break;
                    case "user_type":
                        val =
                            this.authUser.type === "microsoft"
                                ? "msa"
                                : "mojang";
                        break;
                    case "user_properties": // 1.8.9 and below.
                        val = "{}";
                        break;
                    case "version_type":
                        val = this.vanillaManifest.type;
                        break;
                }
                if (val != null) {
                    mcArgs[i] = val;
                }
            }
        }

        // Autoconnect to the selected server.
        const mcArgsWithNumbers: (string | number)[] = mcArgs;
        this._processAutoConnectArg(mcArgsWithNumbers);

        // Prepare game resolution
        if (ConfigManager.getFullscreen()) {
            mcArgsWithNumbers.push("--fullscreen");
            mcArgsWithNumbers.push("true");
        } else {
            mcArgsWithNumbers.push("--width");
            mcArgsWithNumbers.push(ConfigManager.getGameWidth());
            mcArgsWithNumbers.push("--height");
            mcArgsWithNumbers.push(ConfigManager.getGameHeight());
        }

        // Mod List File Argument
        mcArgsWithNumbers.push("--modListFile");
        if (this._lteMinorVersion(9)) {
            mcArgsWithNumbers.push(path.basename(this.fmlDir));
        } else {
            mcArgsWithNumbers.push("absolute:" + this.fmlDir);
        }

        // LiteLoader
        if (this.usingLiteLoader) {
            mcArgsWithNumbers.push("--modRepo");
            mcArgsWithNumbers.push(this.llDir);

            // Set first arg to liteloader tweak class
            mcArgsWithNumbers.unshift(
                "com.mumfrey.liteloader.launch.LiteLoaderTweaker"
            );
            mcArgsWithNumbers.unshift("--tweakClass");
        }

        return mcArgsWithNumbers.map((arg) => arg.toString());
    }

    /**
     * Ensure that the classpath entries all point to jar files.
     *
     * @param list Array of classpath entries.
     */
    private _processClassPathList(list: string[]): void {
        const ext = ".jar";
        const extLen = ext.length;
        for (let i = 0; i < list.length; i++) {
            const extIndex = list[i].indexOf(ext);
            if (extIndex > -1 && extIndex !== list[i].length - extLen) {
                list[i] = list[i].substring(0, extIndex + extLen);
            }
        }
    }

    /**
     * Resolve the full classpath argument list for this process. This method will resolve all Mojang-declared
     * libraries as well as the libraries declared by the server. Since mods are permitted to declare libraries,
     * this method requires all enabled mods as an input
     *
     * @param mods An array of enabled mods which will be launched with this process.
     * @param tempNativePath The path to store the native libraries.
     * @returns An array containing the paths of each library required by this process.
     */
    classpathArg(mods: PhyloriaModule[], tempNativePath: string): string[] {
        let cpArgs: string[] = [];

        if (
            !mcVersionAtLeast("1.17", this.server.rawServer.minecraftVersion) ||
            this.usingFabricLoader
        ) {
            // Add the version.jar to the classpath.
            // Must not be added to the classpath for Forge 1.17+.
            const version = this.vanillaManifest.id;
            cpArgs.push(
                path.join(this.commonDir, "versions", version, version + ".jar")
            );
        }

        if (this.usingLiteLoader && this.llPath) {
            cpArgs.push(this.llPath);
        }

        // Resolve the Mojang declared libraries.
        const mojangLibs = this._resolveMojangLibraries(tempNativePath);

        // Resolve the server declared libraries.
        const servLibs = this._resolveServerLibraries(mods);

        // Merge libraries, server libs with the same
        // maven identifier will override the mojang ones.
        // Ex. 1.7.10 forge overrides mojang's guava with newer version.
        const finalLibs: LibraryMap = { ...mojangLibs, ...servLibs };
        cpArgs = cpArgs.concat(Object.values(finalLibs));

        this._processClassPathList(cpArgs);

        return cpArgs;
    }

    /**
     * Resolve the libraries defined by Mojang's version data. This method will also extract
     * native libraries and point to the correct location for its classpath.
     *
     * TODO - clean up function
     *
     * @param tempNativePath The path to store the native libraries.
     * @returns An object containing the paths of each library mojang declares.
     */
    private _resolveMojangLibraries(tempNativePath: string): LibraryMap {
        const nativesRegex = /.+:natives-([^-]+)(?:-(.+))?/;
        const libs: LibraryMap = {};

        const libArr = this.vanillaManifest.libraries;
        fs.ensureDirSync(tempNativePath);

        for (const lib of libArr) {
            if (isLibraryCompatible(lib.rules, lib.natives)) {
                // Pre-1.19 has a natives object.
                if (lib.natives != null) {
                    // Extract the native library.
                    const exclusionArr = lib.extract?.exclude ?? ["META-INF/"];

                    const nativeKey = lib.natives[getMojangOS()]?.replace(
                        "${arch}",
                        process.arch.replace("x", "")
                    );

                    if (!nativeKey || !lib.downloads.classifiers?.[nativeKey]) {
                        continue;
                    }

                    const artifact = lib.downloads.classifiers[nativeKey];

                    // Location of native zip.
                    const to = path.join(this.libPath, artifact.path);

                    const zip = new AdmZip(to);
                    const zipEntries = zip.getEntries();

                    // Unzip the native zip.
                    for (const entry of zipEntries) {
                        const fileName = entry.entryName;

                        let shouldExclude = false;

                        // Exclude noted files.
                        for (const exclusion of exclusionArr) {
                            if (fileName.indexOf(exclusion) > -1) {
                                shouldExclude = true;
                                break;
                            }
                        }

                        // Extract the file.
                        if (!shouldExclude) {
                            fs.writeFile(
                                path.join(tempNativePath, fileName),
                                entry.getData(),
                                (err?: Error) => {
                                    if (err) {
                                        console.error(
                                            "Error while extracting native library:",
                                            err
                                        );
                                    }
                                }
                            );
                        }
                    }
                }
                // 1.19+ logic
                else if (lib.name.includes("natives-")) {
                    const regexTest = nativesRegex.exec(lib.name);
                    if (!regexTest) continue;

                    // const os = regexTest[1]
                    const arch = regexTest[2] ?? "x64";

                    if (arch !== process.arch) {
                        continue;
                    }

                    // Extract the native library.
                    const exclusionArr = lib.extract?.exclude ?? [
                        "META-INF/",
                        ".git",
                        ".sha1",
                    ];

                    if (!lib.downloads.artifact) {
                        continue;
                    }

                    const artifact = lib.downloads.artifact;

                    // Location of native zip.
                    const to = path.join(this.libPath, artifact.path);

                    const zip = new AdmZip(to);
                    const zipEntries = zip.getEntries();

                    // Unzip the native zip.
                    for (const entry of zipEntries) {
                        if (entry.isDirectory) {
                            continue;
                        }

                        const fileName = entry.entryName;

                        let shouldExclude = false;

                        // Exclude noted files.
                        for (const exclusion of exclusionArr) {
                            if (fileName.indexOf(exclusion) > -1) {
                                shouldExclude = true;
                                break;
                            }
                        }

                        const extractName = fileName.includes("/")
                            ? fileName.substring(fileName.lastIndexOf("/"))
                            : fileName;

                        // Extract the file.
                        if (!shouldExclude) {
                            fs.writeFile(
                                path.join(tempNativePath, extractName),
                                entry.getData(),
                                (err?: Error) => {
                                    if (err) {
                                        console.error(
                                            "Error while extracting native library:",
                                            err
                                        );
                                    }
                                }
                            );
                        }
                    }
                }
                // No natives
                else {
                    const dlInfo = lib.downloads;
                    const artifact = dlInfo.artifact;
                    if (artifact) {
                        const to = path.join(this.libPath, artifact.path);
                        const versionIndependentId = lib.name.substring(
                            0,
                            lib.name.lastIndexOf(":")
                        );
                        libs[versionIndependentId] = to;
                    }
                }
            }
        }

        return libs;
    }

    /**
     * Resolve the libraries declared by this server in order to add them to the classpath.
     * This method will also check each enabled mod for libraries, as mods are permitted to
     * declare libraries.
     *
     * @param mods An array of enabled mods which will be launched with this process.
     * @returns An object containing the paths of each library this server requires.
     */
    private _resolveServerLibraries(mods: PhyloriaModule[]): LibraryMap {
        const mdls = this.server.modules;
        let libs: LibraryMap = {};

        // Locate Forge/Fabric/Libraries
        for (const mdl of mdls) {
            const type = mdl.rawModule.type;
            if (
                type === Type.ForgeHosted ||
                type === Type.Fabric ||
                type === Type.Library
            ) {
                libs[mdl.getVersionlessMavenIdentifier()] = mdl.getPath();
                if (mdl.subModules.length > 0) {
                    const res = this._resolveModuleLibraries(mdl);
                    libs = { ...libs, ...res };
                }
            }
        }

        //Check for any libraries in our mod list.
        for (const mod of mods) {
            if (mod.subModules?.length > 0) {
                const res = this._resolveModuleLibraries(mod);
                libs = { ...libs, ...res };
            }
        }

        return libs;
    }

    /**
     * Recursively resolve the path of each library required by this module.
     *
     * @param mdl A module object from the server distro index.
     * @returns An object containing the paths of each library this module requires.
     */
    private _resolveModuleLibraries(mdl: PhyloriaModule): LibraryMap {
        if (!(mdl.subModules.length > 0)) {
            return {};
        }
        let libs: LibraryMap = {};
        for (const sm of mdl.subModules) {
            if (sm.rawModule.type === Type.Library) {
                if (sm.rawModule.classpath ?? true) {
                    libs[sm.getVersionlessMavenIdentifier()] = sm.getPath();
                }
            }
            // If this module has submodules, we need to resolve the libraries for those.
            // To avoid unnecessary recursive calls, base case is checked here.
            if (sm.subModules.length > 0) {
                const res = this._resolveModuleLibraries(sm);
                libs = { ...libs, ...res };
            }
        }
        return libs;
    }
}
