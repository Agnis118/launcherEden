import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from "electron";
import fs from "fs-extra";
import {
    HeliosDistribution as PhyloriaDistribution,
    HeliosServer as PhyloriaServer,
} from "helios-core/common";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "os";
import * as AuthManager from "./scripts/authmanager";
import * as ConfigManager from "./scripts/configmanager";
import { DistroAPI } from "./scripts/distromanager";
import { onDistroLoad } from "./scripts/preloader";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, "..");

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
    ? path.join(process.env.APP_ROOT, "public")
    : RENDERER_DIST;

let win: BrowserWindow | null;

const phyloriaIcon = path.join(__dirname, "../src/assets/icon.png");

function createWindow() {
    if (win) {
        // Fenêtre déjà créée, ne pas recréer
        return;
    }
    win = new BrowserWindow({
        minWidth: 1280,
        minHeight: 720,
        width: 1280,
        height: 720,
        autoHideMenuBar: true,
        icon: phyloriaIcon,
        webPreferences: {
            preload: path.join(__dirname, "preload.mjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
        show: false,
    });

    win.webContents.on("did-finish-load", () => {
        win?.show();
    });

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL);
    } else {
        win.loadFile(path.join(RENDERER_DIST, "index.html"));
    }
}

app.disableHardwareAcceleration();

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
    ConfigManager.save();
    if (process.platform !== "darwin") {
        app.quit();
        win = null;
    }
});

app.on("activate", () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

let servers: PhyloriaServer[] = [];

app.whenReady().then(() => {
    // Protection contre double initialisation
    let alreadyLoaded = false;

    if (!alreadyLoaded) {
        alreadyLoaded = true;
        ConfigManager.load();

        DistroAPI["commonDir"] = ConfigManager.getCommonDirectory();
        DistroAPI["instanceDir"] = ConfigManager.getInstanceDirectory();

        DistroAPI.getDistribution()
            .then((phyloriaDistro: PhyloriaDistribution) => {
                console.info("Loaded distribution index.");
                onDistroLoad(phyloriaDistro);
                ConfigManager.syncModConfigurations(phyloriaDistro);
                ConfigManager.ensureJavaSettings(phyloriaDistro);
                servers = phyloriaDistro.servers;
                ConfigManager.save();
                createWindow();
            })
            .catch((err) => {
                console.info(
                    "Failed to load an older version of the distribution index."
                );
                console.info("Application cannot run.");
                console.error(err);

                onDistroLoad(null);
                dialog.showErrorBox(
                    "Erreur de configuration",
                    "Impossible de charger la configuration du launcher. Veuillez vérifier votre connexion internet."
                );
                app.quit();
            });

        // Clean up temp dir incase previous launches ended unexpectedly.
        fs.remove(
            path.join(os.tmpdir(), ConfigManager.getTempNativeFolder()),
            (err) => {
                if (err) {
                    console.warn("Error while cleaning natives directory", err);
                } else {
                    console.info("Cleaned natives directory.");
                }
            }
        );
    }
});

// Microsoft Auth Login
// Add missing imports or definitions at the top of the file
import { ACCOUNT, AZURE_CLIENT_ID, GAME, LOGIN } from "./scripts/ipcconstants";

const REDIRECT_URI_PREFIX =
    "https://login.microsoftonline.com/common/oauth2/nativeclient?";

// Specify types for variables
let msftAuthWindow: BrowserWindow | undefined | null;
let msftAuthSuccess: boolean | undefined;
let msftAuthViewSuccess: unknown;
let msftAuthViewOnClose: unknown;

ipcMain.handle(
    LOGIN.OPEN,
    async (_event: IpcMainInvokeEvent, ...arguments_: unknown[]) => {
        if (msftAuthWindow) {
            return [LOGIN.ERROR, LOGIN.ALREADY_OPEN, msftAuthViewOnClose];
        }
        msftAuthSuccess = false;
        msftAuthViewSuccess = arguments_[0];
        msftAuthViewOnClose = arguments_[1];
        return await new Promise((resolve) => {
            msftAuthWindow = new BrowserWindow({
                title: "Connexion avec Microsoft",
                backgroundColor: "#222222",
                width: 520,
                height: 600,
                frame: true,
                icon: phyloriaIcon,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                },
            });

            msftAuthWindow.on("closed", () => {
                msftAuthWindow = undefined;
            });

            msftAuthWindow.on("close", () => {
                if (!msftAuthSuccess) {
                    resolve([
                        LOGIN.ERROR,
                        LOGIN.NOT_FINISHED,
                        msftAuthViewOnClose,
                    ]);
                }
            });

            msftAuthWindow.webContents.on("did-navigate", (_, uri: string) => {
                if (uri.startsWith(REDIRECT_URI_PREFIX)) {
                    const queryMap: Record<string, string> = {};
                    new URL(uri).searchParams.forEach((value, name) => {
                        queryMap[name] = value;
                    });

                    msftAuthSuccess = true;
                    msftAuthWindow?.close();
                    msftAuthWindow = null;
                    resolve([LOGIN.SUCCESS, queryMap, msftAuthViewSuccess]);
                }
            });

            msftAuthWindow.removeMenu();
            msftAuthWindow.loadURL(
                `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?prompt=select_account&client_id=${AZURE_CLIENT_ID}&response_type=code&scope=XboxLive.signin%20offline_access&redirect_uri=https://login.microsoftonline.com/common/oauth2/nativeclient`
            );
        });
    }
);

ipcMain.handle(
    LOGIN.ADD_ACCOUNT,
    async (_event: IpcMainInvokeEvent, authCode: string) => {
        try {
            const datas = await AuthManager.addMicrosoftAccount(authCode);
            return {
                success: true,
                data: datas,
            };
        } catch (err) {
            let errorInfo = {
                title: "Erreur inconnue",
                desc: String(err),
                recoverable: true,
            };
            // Gestion des erreurs structurées d'authManager
            if (typeof err === "object" && err !== null) {
                const errStr = String(err);
                if (errStr.startsWith("AUTH_ERROR:")) {
                    errorInfo = JSON.parse(errStr.replace("AUTH_ERROR:", ""));
                } else if (errStr.startsWith("RATE_LIMITED:")) {
                    errorInfo = {
                        title: "Trop de tentatives",
                        desc: `Veuillez patienter ${
                            errStr.split(":")[1]
                        } secondes avant de réessayer.`,
                        recoverable: true,
                    };
                }
            }
            console.error("Impossible d'ajouter le compte Microsoft :", err);
            return {
                success: false,
                error: errorInfo,
            };
        }
    }
);

ipcMain.handle(LOGIN.VERIFY_AUTH, async () => {
    try {
        const isValid = await AuthManager.validateSelected();
        return {
            valid: isValid,
        };
    } catch (err) {
        return {
            valid: false,
            error: String(err),
        };
    }
});

import { dialog } from "electron";
import { dlAsync } from "./scripts/dlAsync";

ipcMain.on(GAME.LAUNCH, async () => {
    try {
        const win = BrowserWindow.getFocusedWindow();
        await dlAsync({
            onProgress: (percent) => {
                win?.webContents.send(GAME.LAUNCH_PROGRESS, percent);
            },
            onDetails: (message) => {
                win?.webContents.send(GAME.LAUNCH_DETAILS, message);
            },
            onClose: () => {
                win?.webContents.send(GAME.CLOSE);
            },
        });
    } catch (err) {
        console.error("Error launching game:", err);
        const errorMessage =
            err instanceof Error ? err.message : String(err);
        BrowserWindow.getFocusedWindow()?.webContents.send(
            GAME.LAUNCH_ERROR,
            errorMessage
        );
    }
});

ipcMain.handle(GAME.GET_ALL_SERVERS, async () => {
    return servers;
});

ipcMain.handle(GAME.GET_SERVER, async () => {
    return (
        servers.find(
            (server) =>
                server.rawServer.id === ConfigManager.getSelectedServer()
        ) || null
    );
});

ipcMain.on(GAME.SET_SERVER, async (_event, serverId: string) => {
    const serverExists = servers.some(
        (server) => server.rawServer.id === serverId
    );
    if (serverExists) {
        ConfigManager.setSelectedServer(serverId);
        ConfigManager.save();
        win?.webContents.send(
            GAME.SERVER_SELECTED_UPDATE,
            servers.find((server) => server.rawServer.id === serverId)
        );
    } else {
        console.error("Unknown server ID:", serverId);
    }
});

ipcMain.handle(ACCOUNT.GET_INFORMATIONS, async () => {
    const selected = ConfigManager.getSelectedAccount();
    if (selected) {
        return {
            pseudo: selected.displayName,
            uuid: selected.uuid,
        };
    }
    return null;
});

ipcMain.handle(ACCOUNT.LOGOUT, async () => {
    const selected = ConfigManager.getSelectedAccount();
    if (selected) {
        await AuthManager.removeMicrosoftAccount(selected.uuid);
        return { success: true };
    }
    return { success: false };
});

// IPC Parameters
import { PARAMETERS } from "./scripts/ipcconstants";

ipcMain.handle(PARAMETERS.GET_MINECRAFT, async () => {
    const width = ConfigManager.getGameWidth();
    const height = ConfigManager.getGameHeight();
    const fullscreen = ConfigManager.getFullscreen();
    const minecraftConfig = {
        width,
        height,
        fullscreen,
    };
    return minecraftConfig;
});

ipcMain.on(PARAMETERS.SET_MINECRAFT, async (_event, data) => {
    console.log("Setting Minecraft parameters:", data);
    ConfigManager.setGameWidth(data.width);
    ConfigManager.setGameHeight(data.height);
    ConfigManager.setFullscreen(data.fullscreen);
    ConfigManager.save();
});

ipcMain.handle(PARAMETERS.GET_MODPACK, async (_event, server) => {
    const modConfig = ConfigManager.getModConfiguration(server.rawServer.id);
    const minRam = modConfig ? modConfig.minRam : null;
    const maxRam = modConfig ? modConfig.maxRam : null;
    const modpackConfig = {
        minRam,
        maxRam,
    };
    return modpackConfig;
});

ipcMain.handle(GAME.GET_SYSTEM_RAM, async () => {
    return {
        total: Math.floor(os.totalmem() / (1024 * 1024)),
        available: Math.floor(os.freemem() / (1024 * 1024)),
    };
});

ipcMain.handle(GAME.GET_MOD_RAM, async (_event, server) => {
    const minRam = ConfigManager.getMinRAM(server.rawServer.id);
    const maxRam = ConfigManager.getMaxRAM(server.rawServer.id);
    console.log("Getting Mod RAM for server:", server.rawServer.id, {
        minRam,
        maxRam,
    });
    return {
        minRam,
        maxRam,
    };
});

ipcMain.on(GAME.SET_MOD_RAM, async (_event, data) => {
    const selectedServerId = ConfigManager.getSelectedServer();
    if (selectedServerId) {
        ConfigManager.setMaxRAM(selectedServerId, data.maxRam);
        ConfigManager.setMinRAM(selectedServerId, data.minRam);
        ConfigManager.save();
    } else {
        console.error("No server selected, cannot set mod RAM.");
        return;
    }
});
