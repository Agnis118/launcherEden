import PhyloriaLogo from "@/src/assets/icon.png";
import React from "react";

const Loading: React.FC = () => (
    <div className="flex flex-col items-center justify-center h-screen">
        <img
            src={PhyloriaLogo}
            alt="Phyloria Logo"
            className="w-20 h-20 mb-6"
        />
        <div className="flex items-center space-x-3">
            <div className="w-8 h-8 border-4 border-primary border-t-blue-500 rounded-full animate-spin" />
            <span className="text-lg text-primary font-semibold">
                Chargement du launcher...
            </span>
        </div>
    </div>
);

export default Loading;
