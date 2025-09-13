import { createContext, useContext } from "react";
import { GameContextType } from "./GameContext";

export const GameContext = createContext<GameContextType | null>(null);

export function useGame(): GameContextType {
    const context = useContext(GameContext);
    if (!context) {
        throw new Error("useGame must be used within a GameProvider");
    }
    return context;
}
