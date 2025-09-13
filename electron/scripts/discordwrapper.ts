// Work in progress

import { Client } from "@xhayper/discord-rpc";

let client: Client | null;
let activity: {
    details?: string;
    state?: string;
    largeImageKey?: string;
    largeImageText?: string;
    smallImageKey?: string;
    smallImageText?: string;
    startTimestamp?: number;
    instance?: boolean;
} | null;

export function initRPC(
    genSettings: {
        smallImageKey: string;
        smallImageText: string;
        clientId: string;
    },
    servSettings: { largeImageKey: string; largeImageText: string },
    initialDetails = "Lang.queryJS('discord.waiting')"
) {
    client = new Client({
        clientId: genSettings.clientId,
        transport: { type: "ipc" },
    });
    activity = {
        details: initialDetails,
        state: "Lang.queryJS('discord.state', { shortId: servSettings.shortId })",
        largeImageKey: servSettings.largeImageKey,
        largeImageText: servSettings.largeImageText,
        smallImageKey: genSettings.smallImageKey,
        smallImageText: genSettings.smallImageText,
        startTimestamp: new Date().getTime(),
        instance: false,
    };
    if (client) {
        client.on("ready", () => {
            console.info("Discord RPC Connected");
            if (client && activity && client.user) {
                client.user.setActivity(activity);
            }
        });
    }
    if (client) {
        client.login().catch((error) => {
            if (error.message.includes("ENOENT")) {
                console.info(
                    "Unable to initialize Discord Rich Presence, no client detected."
                );
            } else {
                console.info(
                    "Unable to initialize Discord Rich Presence: " +
                        error.message,
                    error
                );
            }
        });
    }
}

export function updateDetails(details: string) {
    if (activity && client) {
        activity.details = details;
        if (client.user) {
            client.user.setActivity(activity);
        }
    }
}

export function shutdownRPC() {
    if (!client) return;
    if (client.user) {
        client.user.clearActivity();
    }
    client.destroy();
    client = null;
    activity = null;
}
