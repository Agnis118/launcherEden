/* eslint-disable @typescript-eslint/no-explicit-any */
import { GAME } from "@/electron/scripts/ipcconstants";
import { ReactNode, useEffect, useState } from "react";

export interface GameContextType {
    servers: any;
    currentServer: any;
    setIsLaunch: (value: boolean) => void;
    isLaunch: boolean;
}

import { GameContext } from "./GameContextObject";

export function GameProvider({ children }: { children: ReactNode }) {
    const [isLaunch, setIsLaunch] = useState(false);
    const [servers, setServers] = useState<any | null>(null);
    const [currentServer, setCurrentServer] = useState<any | null>(null);

    useEffect(() => {
        window.ipcRenderer.invoke(GAME.GET_ALL_SERVERS).then((data) => {
            setServers(data);
        });
        window.ipcRenderer.invoke(GAME.GET_SERVER).then((data) => {
            setCurrentServer(data);
        });
    }, []);

    useEffect(() => {
        const handler = (_event: any, data: any) => {
            setCurrentServer(data);
        };
        window.ipcRenderer.on(GAME.SERVER_SELECTED_UPDATE, handler);
        return () => {
            window.ipcRenderer.off(GAME.SERVER_SELECTED_UPDATE, handler);
        };
    }, []);

    if (!servers) return;

    return (
        <GameContext.Provider
            value={{ servers, currentServer, isLaunch, setIsLaunch }}
        >
            {children}
        </GameContext.Provider>
    );
}
