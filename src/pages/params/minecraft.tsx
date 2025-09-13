import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { PARAMETERS } from "@/electron/scripts/ipcconstants";
import { GamepadIcon, SaveIcon } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

const getScreenSize = () => ({
    width: window.screen.width,
    height: window.screen.height,
});

const MIN_WIDTH = 1280;
const MIN_HEIGHT = 720;

const MinecraftParameters: React.FC = () => {
    const [width, setWidth] = useState(MIN_WIDTH);
    const [height, setHeight] = useState(MIN_HEIGHT);
    const [fullscreen, setFullscreen] = useState(false);

    const screenSize = getScreenSize();

    useEffect(() => {
        // Charger les paramètres actuels depuis le backend
        window.ipcRenderer.invoke(PARAMETERS.GET_MINECRAFT).then((data) => {
            setWidth(data.width || MIN_WIDTH);
            setHeight(data.height || MIN_HEIGHT);
            setFullscreen(data.fullscreen || false);
        });
    }, []);

    const handleSave = () => {
        window.ipcRenderer.send(PARAMETERS.SET_MINECRAFT, {
            width,
            height,
            fullscreen,
        });
        // Optionally, show a toast or notification for success
        toast.success("Paramètres Minecraft sauvegardés !");
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <GamepadIcon className="h-5 w-5" />
                    Configuration Minecraft
                </CardTitle>
                <CardDescription>
                    Configurez les paramètres de Minecraft
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-4">
                    <div>
                        <h2 className="pb-4">
                            Largeur de la fenêtre ({width}px)
                        </h2>
                        <Slider
                            min={MIN_WIDTH}
                            max={screenSize.width}
                            value={[width]}
                            onValueChange={([val]) => setWidth(val)}
                            step={1}
                        />
                        <div className="text-xs text-muted-foreground p-3">
                            Min: {MIN_WIDTH}px, Max: {screenSize.width}px
                        </div>
                    </div>
                    <div>
                        <h2 className="pb-4">
                            Hauteur de la fenêtre ({height}px)
                        </h2>
                        <Slider
                            min={MIN_HEIGHT}
                            max={screenSize.height}
                            value={[height]}
                            onValueChange={([val]) => setHeight(val)}
                            step={1}
                        />
                        <div className="text-xs text-muted-foreground p-3">
                            Min: {MIN_HEIGHT}px, Max: {screenSize.height}px
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                    <h2>Lancer en plein écran</h2>
                    <Switch
                        checked={fullscreen}
                        onCheckedChange={setFullscreen}
                    />
                </div>

                <div className="pt-4 flex justify-end">
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 cursor-pointer bg-primary px-4 py-2 rounded-md text-primary-foreground hover:bg-secondary transition-all"
                    >
                        <SaveIcon className="h-4 w-4" />
                        Sauvegarder
                    </button>
                </div>
            </CardContent>
        </Card>
    );
};

export default MinecraftParameters;
