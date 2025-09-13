import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { GAME } from "@/electron/scripts/ipcconstants";
import { useGame } from "@/src/context/GameContextObject";
import { HeliosServer as PhyloriaServer } from "helios-core/common";
import { useEffect, useState } from "react";

export default function LaunchPanel() {
    const { setIsLaunch, isLaunch, currentServer } = useGame();

    const [progress, setProgress] = useState(0);
    const [details, setDetails] = useState("Lancement du jeu");
    const [loading, setLoading] = useState(false);
    const [cuServer, setCuServer] = useState<PhyloriaServer | null>(null);

    useEffect(() => {
        setCuServer(currentServer);
    }, [currentServer]);

    useEffect(() => {
        // Progression
        window.ipcRenderer.on(GAME.LAUNCH_PROGRESS, (_event, percent) => {
            setProgress(percent);
        });
        // Détails
        window.ipcRenderer.on(GAME.LAUNCH_DETAILS, (_event, message) =>
            setDetails(message)
        );
        // Fermeture du jeu
        window.ipcRenderer.on(GAME.CLOSE, () => {
            setLoading(false);
            setDetails("Lancement du jeu");
            setProgress(0);
            setIsLaunch(false);
        });
        return () => {
            window.ipcRenderer.removeAllListeners(GAME.LAUNCH_PROGRESS);
            window.ipcRenderer.removeAllListeners(GAME.LAUNCH_DETAILS);
            window.ipcRenderer.removeAllListeners(GAME.CLOSE);
        };
    }, [setIsLaunch]);

    const handleLaunch = async () => {
        if (isLaunch) return;
        setLoading(true);
        setIsLaunch(true);

        try {
            window.ipcRenderer.send(GAME.LAUNCH);
        } catch (err) {
            setDetails("Erreur: " + err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            onClick={loading ? undefined : handleLaunch}
            className="flex-1 flex flex-col items-start justify-center px-8 py-5 text-left transition-all"
            disabled={loading}
        >
            <span className="text-lg font-bold uppercase">{details}</span>
            <span className="flex items-center text-sm font-medium opacity-90">
                {cuServer?.rawServer.description || "Aucun serveur sélectionné"}
            </span>
            {progress > 0 && progress < 100 && (
                <div className="w-full mt-3">
                    <Progress
                        className="w-full mt-3"
                        value={progress}
                        max={100}
                    />
                </div>
            )}
        </Button>
    );
}
