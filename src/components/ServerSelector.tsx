import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { GAME } from "@/electron/scripts/ipcconstants";
import { cn } from "@/lib/utils";
import { useGame } from "@/src/context/GameContextObject";
import { HeliosServer as PhyloriaServer } from "helios-core/common";
import { ArrowDownIcon } from "lucide-react";
import React from "react";

interface ServerSelectorProps {
    showCurrentServer?: boolean;
}

const ServerSelector: React.FC<ServerSelectorProps> = ({
    showCurrentServer = false,
}) => {
    const [open, setOpen] = React.useState(false);
    const { servers, currentServer } = useGame();

    const [selectedServer, setSelectedServer] =
        React.useState<PhyloriaServer | null>(null);

    React.useEffect(() => {
        if (currentServer) {
            setSelectedServer(currentServer);
        }
    }, [currentServer]);

    const handleSelect = (serverId: string) => {
        window.ipcRenderer.send(GAME.SET_SERVER, serverId);
        setOpen(false);
    };

    return (
        <Popover open={open}>
            <PopoverTrigger asChild>
                <button
                    className={cn(
                        "flex items-center justify-between px-4 transition-all",
                        showCurrentServer && "w-full"
                    )}
                    onClick={() => setOpen(!open)}
                >
                    {showCurrentServer && selectedServer && (
                        <span className="mr-4">
                            {selectedServer.rawServer.icon && (
                                <img
                                    src={selectedServer.rawServer.icon}
                                    alt={selectedServer.rawServer.name}
                                    className="w-8 h-8 mr-2 inline-block align-middle"
                                />
                            )}
                            {selectedServer.rawServer.name}
                        </span>
                    )}
                    <ArrowDownIcon className="w-6 h-6" />
                </button>
            </PopoverTrigger>

            <PopoverContent className="w-auto p-0">
                <ul className="max-h-60 overflow-auto">
                    {servers.map((server: PhyloriaServer) => (
                        <li
                            key={server.rawServer.id}
                            onClick={() => handleSelect(server.rawServer.id)}
                            className={`flex items-center px-4 py-2 cursor-pointer transition-all ${
                                selectedServer?.rawServer.id ===
                                server.rawServer.id
                                    ? "bg-secondary-launch font-semibold"
                                    : "hover:bg-tertiary-launch"
                            }`}
                        >
                            {server.rawServer.icon && (
                                <img
                                    src={server.rawServer.icon}
                                    alt={server.rawServer.name}
                                    className="w-6 h-6 mr-2"
                                />
                            )}
                            {server.rawServer.name}
                        </li>
                    ))}
                </ul>
            </PopoverContent>
        </Popover>
    );
};

export default ServerSelector;
