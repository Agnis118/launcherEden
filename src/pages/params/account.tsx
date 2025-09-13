import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { ACCOUNT } from "@/electron/scripts/ipcconstants";
import microsoftIcon from "@/src/assets/microsoft.svg";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const AccountParameters: React.FC = () => {
    const [pseudo, setPseudo] = useState<string>("");
    const [skin, setSkin] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [uuid, setUuid] = useState<string>("");

    useEffect(() => {
        window.ipcRenderer.invoke(ACCOUNT.GET_INFORMATIONS).then((data) => {
            setPseudo(data.pseudo);
            setSkin(`https://mc-heads.net/body/${data.uuid}`);
            setUuid(data.uuid);
            setLoading(false);
        });
    }, []);

    const navigate = useNavigate();
    const handleLogout = () => {
        window.ipcRenderer
            .invoke(ACCOUNT.LOGOUT)
            .then((data: { success: boolean }) => {
                if (data.success) {
                    setPseudo("");
                    setSkin("");
                    setLoading(true);
                    navigate("/login");
                }
            });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    Compte Minecraft
                </CardTitle>
                <CardDescription>Gérez votre compte Minecraft</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {loading ? (
                    <div>Chargement des informations...</div>
                ) : (
                    <div className="flex flex-col justify-center items-left gap-4">
                        {/* Microsoft Logo SVG */}
                        <span className="inline-flex items-left gap-2">
                            <img
                                src={microsoftIcon}
                                alt="Microsoft Logo"
                                className="h-5 w-5"
                            />
                            Compte Microsoft
                        </span>
                        <hr className="border-t border-foreground my-2" />
                        <div className="relative group">
                            <div className="flex items-center gap-4 bg-muted rounded-lg p-4">
                                <img
                                    src={skin}
                                    alt="Skin Minecraft"
                                    className="w-16 h-auto shadow object-contain"
                                />
                                <div className="flex flex-col justify-center">
                                    <div className="text-lg font-bold">
                                        Username: {pseudo}
                                    </div>
                                    <div className="text-xs text-muted-foreground break-all">
                                        UUID : {uuid}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="absolute bottom-2 right-2 bg-destructive px-4 py-2 rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-tertiary hover:cursor-pointer"
                            >
                                Se déconnecter
                            </button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default AccountParameters;
