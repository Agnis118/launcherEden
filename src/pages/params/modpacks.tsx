import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { GAME } from "@/electron/scripts/ipcconstants";
import ServerSelector from "@/src/components/ServerSelector";
import { useGame } from "@/src/context/GameContextObject";
import { Package, Save as SaveIcon } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

const MIN_RAM_GB = 4.0;
const MB_PER_GB = 1024;
const getSystemRam = () => {
    return window.ipcRenderer.invoke(GAME.GET_SYSTEM_RAM).then((data) => data);
};

const ModpackParameters: React.FC = () => {
    const [minRam, setMinRam] = useState(MIN_RAM_GB);
    const [maxRam, setMaxRam] = useState(MIN_RAM_GB);
    const [systemRam, setSystemRam] = useState(MIN_RAM_GB);
    const [systemAvailableRam, setSystemAvailableRam] = useState(MIN_RAM_GB);
    const { currentServer } = useGame();

    useEffect(() => {
        getSystemRam().then((ram) => {
            setSystemRam(Number((ram.total / MB_PER_GB).toFixed(1)));
            setSystemAvailableRam(
                Number((ram.available / MB_PER_GB).toFixed(1))
            );
        });
    }, []);

    useEffect(() => {
        window.ipcRenderer
            .invoke(GAME.GET_MOD_RAM, currentServer)
            .then((data) => {
                const minRamValue = parseInt(data.minRam);
                const maxRamValue = parseInt(data.maxRam);

                setMinRam(minRamValue);
                setMaxRam(maxRamValue);
            });
    }, [currentServer]);

    const handleMinRamChange = (value: number[]) => {
        const val = Math.max(MIN_RAM_GB, Math.min(value[0], systemRam));
        setMinRam(val);
        if (val > maxRam) setMaxRam(val);
    };

    const handleMaxRamChange = (value: number[]) => {
        const val = Math.max(minRam, Math.min(value[0], systemRam));
        setMaxRam(val);
    };

    const handleSave = () => {
        window.ipcRenderer.send(GAME.SET_MOD_RAM, {
            minRam: minRam + "G",
            maxRam: maxRam + "G",
        });
        toast.success("Paramètres Modpacks sauvegardés !");
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Configuration Modpacks
                </CardTitle>
                <CardDescription>
                    Gérez vos modpacks et leurs paramètres
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <h2>Serveur</h2>
                    <ServerSelector showCurrentServer={true} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <h2>RAM Minimum (Go)</h2>
                        <Slider
                            min={MIN_RAM_GB}
                            max={systemRam}
                            step={0.5}
                            value={[minRam]}
                            onValueChange={handleMinRamChange}
                        />
                        <div>{minRam} Go</div>
                        <h2>RAM Maximum (Go)</h2>
                        <Slider
                            min={MIN_RAM_GB}
                            max={systemRam}
                            step={0.5}
                            value={[maxRam]}
                            onValueChange={handleMaxRamChange}
                        />
                        <div>{maxRam} Go</div>
                    </div>
                    <div className="flex flex-col justify-center space-y-2">
                        <div className="flex flex-col text-sm text-muted-foreground text-right gap-6">
                            <div>RAM Système: {systemRam} Go</div>
                            <div>RAM Disponible: {systemAvailableRam} Go</div>
                        </div>
                    </div>
                </div>
                <div className="pt-4">
                    <Button
                        onClick={handleSave}
                        className="flex items-center gap-2 cursor-pointer"
                    >
                        <SaveIcon className="h-4 w-4" />
                        Sauvegarder
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default ModpackParameters;
