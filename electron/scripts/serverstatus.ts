/* eslint-disable no-control-regex */
import net from "net";

/**
 * Retrieves the status of a minecraft server.
 *
 * @param {string} address The server address.
 * @param {number} port Optional. The port of the server. Defaults to 25565.
 * @returns {Promise.<Object>} A promise which resolves to an object containing
 * status information.
 */
export function getStatus(
    address: string,
    port: number | string = 25565
): Promise<{
    online: boolean;
    version?: string;
    motd?: string;
    onlinePlayers?: string;
    maxPlayers?: string;
    code?: string;
    errno?: string;
    address?: string;
    port?: number | string;
}> {
    if (port == null || port == "") {
        port = 25565;
    }
    if (typeof port === "string") {
        port = parseInt(port);
    }
    return new Promise((resolve, reject) => {
        const socket = net.connect(port, address, () => {
            const buff = Buffer.from([0xfe, 0x01]);
            socket.write(buff);
        });
        socket.setTimeout(2500, () => {
            socket.end();
            reject({
                code: "ETIMEDOUT",
                errno: "ETIMEDOUT",
                address,
                port,
            });
        });
        socket.on("data", (data) => {
            if (data != null) {
                const server_info = data.toString().split("\x00\x00\x00");
                const NUM_FIELDS = 6;
                if (server_info != null && server_info.length >= NUM_FIELDS) {
                    resolve({
                        online: true,
                        version: server_info[2].replace(/\u0000/g, ""),
                        motd: server_info[3].replace(/\u0000/g, ""),
                        onlinePlayers: server_info[4].replace(/\u0000/g, ""),
                        maxPlayers: server_info[5].replace(/\u0000/g, ""),
                    });
                } else {
                    resolve({
                        online: false,
                    });
                }
            }
            socket.end();
        });

        socket.on("error", (err) => {
            socket.destroy();
            reject(err);
            // ENOTFOUND = Unable to resolve.
            // ECONNREFUSED = Unable to connect to port.
        });
    });
}
