import { Button } from "@/components/ui/button";
import { LOGIN } from "@/electron/scripts/ipcconstants";
import PhyloriaLogo from "@/src/assets/icon.png";
import microsoftIcon from "@/src/assets/microsoft.svg";
import React, { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface AuthReplyData extends Record<string, unknown> {
    success?: boolean;
    error?: string;
    message?: string;
    title?: string;
    desc?: string;
}

// États de connexion
enum LoginState {
    IDLE = "idle",
    CONNECTING = "connecting",
    AUTHENTICATING = "authenticating",
    SUCCESS = "success",
    ERROR = "error",
}

const Login: React.FC = () => {
    const navigate = useNavigate();
    const alreadySentRef = useRef(false);
    const [loginState, setLoginState] = useState<LoginState>(LoginState.IDLE);
    const [isLoading, setIsLoading] = useState(false);

    // Formateur d'erreur : utilise directement l'objet structuré reçu du backend
    const formatError = useCallback(
        (
            error: unknown
        ): { title: string; desc: string; recoverable: boolean } => {
            if (typeof error === "object" && error !== null) {
                const errorObj = error as AuthReplyData;
                if (errorObj.title && errorObj.desc) {
                    return {
                        title: errorObj.title,
                        desc: errorObj.desc,
                        recoverable:
                            typeof errorObj.recoverable === "boolean"
                                ? errorObj.recoverable
                                : true,
                    };
                }
            }
            // Fallback générique
            return {
                title: "Erreur inconnue",
                desc:
                    typeof error === "string"
                        ? error
                        : "Une erreur inconnue est survenue.",
                recoverable: true,
            };
        },
        []
    );

    // Gestion des erreurs avec retry logic
    const handleError = useCallback(
        (message: string, details?: unknown) => {
            console.error("Login Error:", { message, details });
            setLoginState(LoginState.ERROR);
            setIsLoading(false);

            const formattedError = formatError(details || message);

            // Erreur standard
            toast.error(formattedError.title, {
                description: formattedError.desc,
                duration: 5000,
            });
        },
        [formatError]
    );

    // Gestion du succès avec feedback
    const handleSuccess = useCallback(
        (message: string, description?: string) => {
            setLoginState(LoginState.SUCCESS);
            toast.success(message, {
                description,
                duration: 3000,
            });
        },
        []
    );

    // Gestion du clic sur le bouton de connexion
    const handleMicrosoftLogin = useCallback(async () => {
        if (isLoading || loginState === LoginState.CONNECTING) {
            return; // Éviter les double-clics
        }

        console.log("Initiating Microsoft login...");
        setIsLoading(true);
        setLoginState(LoginState.CONNECTING);
        alreadySentRef.current = false; // Reset du flag

        try {
            toast.info("Ouverture de la fenêtre Microsoft...", {
                description:
                    "Veuillez vous connecter dans la fenêtre qui s'ouvre",
                duration: 3000,
            });
            const [type, data] = await window.ipcRenderer.invoke(LOGIN.OPEN);
            // On traite la réponse directement
            if (type === LOGIN.ERROR) {
                handleError(
                    "Échec de l'ouverture de la fenêtre Microsoft",
                    data
                );
                setIsLoading(false);
                setLoginState(LoginState.IDLE);
                return;
            }
            if (type === LOGIN.SUCCESS) {
                if (data.error) {
                    handleError("Microsoft a retourné une erreur", data.error);
                    setIsLoading(false);
                    setLoginState(LoginState.IDLE);
                    return;
                }
                const authCode = data.code;
                if (!authCode || typeof authCode !== "string") {
                    handleError(
                        "Code d'authentification invalide ou manquant",
                        data
                    );
                    setIsLoading(false);
                    setLoginState(LoginState.IDLE);
                    return;
                }
                if (alreadySentRef.current) {
                    console.warn("Auth code already sent, ignoring duplicate");
                    setIsLoading(false);
                    setLoginState(LoginState.IDLE);
                    return;
                }
                alreadySentRef.current = true;
                setLoginState(LoginState.AUTHENTICATING);
                handleSuccess(
                    "Code d'authentification reçu",
                    "Authentification en cours..."
                );
                // Envoie le code et attend la réponse
                const authReply = await window.ipcRenderer.invoke(
                    LOGIN.ADD_ACCOUNT,
                    authCode
                );
                setIsLoading(false);
                if (authReply.success) {
                    handleSuccess(
                        "Connexion réussie !",
                        "Redirection vers l'application..."
                    );
                    setTimeout(() => {
                        alreadySentRef.current = false;
                        navigate("/home");
                        setLoginState(LoginState.IDLE);
                    }, 1000);
                } else {
                    handleError(
                        "Échec de l'ajout du compte",
                        authReply.error || authReply
                    );
                    alreadySentRef.current = false;
                    setLoginState(LoginState.IDLE);
                }
            }
        } catch (error) {
            handleError("Impossible de lancer la connexion Microsoft", error);
            setIsLoading(false);
            setLoginState(LoginState.IDLE);
        }
    }, [isLoading, loginState, handleError, handleSuccess, navigate]);

    // Setup des listeners IPC
    // Les listeners ne sont plus nécessaires, tout est géré via invoke/await

    // Texte du bouton en fonction de l'état
    const getButtonText = () => {
        switch (loginState) {
            case LoginState.CONNECTING:
                return "Connexion en cours...";
            case LoginState.AUTHENTICATING:
                return "Authentification...";
            case LoginState.SUCCESS:
                return "Redirection...";
            default:
                return "Se connecter avec Microsoft";
        }
    };

    const isDisabled = isLoading || loginState !== LoginState.IDLE;

    return (
        <div className="relative w-full min-h-screen flex flex-col items-center justify-center text-primary overflow-hidden">
            <div className="flex flex-col items-center z-20">
                <img
                    src={PhyloriaLogo}
                    alt="Phyloria Logo"
                    className="mb-6 w-32 drop-shadow-lg"
                />
                <h1 className="text-4xl font-bold mb-16 text-center">
                    Bienvenue sur Phyloria
                </h1>
                <Button
                    onClick={handleMicrosoftLogin}
                    disabled={isDisabled}
                    className="text-lg flex items-center gap-3 px-8 py-6 mb-2 bg-tertiary text-primary rounded-lg hover:bg-secondary transition-all duration-200 hover:scale-105 disabled:hover:scale-100 disabled:opacity-70"
                >
                    <img
                        src={microsoftIcon}
                        alt="Microsoft Logo"
                        className="w-5 h-5"
                    />
                    {getButtonText()}
                </Button>

                {/* Indicateur d'état optionnel */}
                {loginState !== LoginState.IDLE && (
                    <p className="text-sm text-muted-foreground mt-4 text-center">
                        {loginState === LoginState.CONNECTING &&
                            "Ouverture de la fenêtre Microsoft..."}
                        {loginState === LoginState.AUTHENTICATING &&
                            "Vérification de vos identifiants..."}
                        {loginState === LoginState.SUCCESS &&
                            "Connexion réussie ! Redirection..."}
                        {loginState === LoginState.ERROR &&
                            "Une erreur est survenue. Veuillez réessayer."}
                    </p>
                )}

                {/* Informations de retry supprimées (rate limiting côté backend uniquement) */}
            </div>
        </div>
    );
};

export default Login;
