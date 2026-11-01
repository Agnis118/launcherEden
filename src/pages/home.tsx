import { cn } from "@/lib/utils";
import PhyloriaLogo from "@/src/assets/Boussole.png";
import LaunchPanel from "@/src/components/LaunchPanel";
import ServerSelector from "@/src/components/ServerSelector";
import { useGame } from "@/src/context/GameContextObject";
import React from "react";
import Parameters from "./parameters";

const Home: React.FC = () => {
    const { isLaunch } = useGame();

    return (
        <div className="relative flex flex-col items-center justify-center h-screen text-primary">
            <Parameters />
            <img src={PhyloriaLogo} alt="Phyloria Logo" className="mb-6 w-32" />
            <h1 className="text-4xl font-bold mb-16">La boussole des mondes</h1>
            <div className="relative w-full max-w-md">
                <div
                    className={cn(
                        "flex overflow-hidden rounded-lg shadow-lg bg-gradient-to-r hover:scale-105 transform transition-all",
                        isLaunch
                            ? "from-secondary-launch to-tertiary-launch"
                            : "from-secondary to-tertiary"
                    )}
                >
                    {/* Bouton "Lancer le jeu" */}
                    <LaunchPanel />

                    {/* Bouton flèche */}
                    <ServerSelector />
                </div>
            </div>
        </div>
    );
};

export default Home;
