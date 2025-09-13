import { LOGIN } from "@/electron/scripts/ipcconstants";
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const VerifyAuth: React.FC = () => {
    const navigate = useNavigate();

    const alreadySentRef = React.useRef(false);
    useEffect(() => {
        if (!alreadySentRef.current) {
            alreadySentRef.current = true;
            window.ipcRenderer.invoke(LOGIN.VERIFY_AUTH).then((data) => {
                if (data.valid) {
                    navigate("/home");
                } else {
                    navigate("/login");
                }
            });
        }
    }, [navigate]);

    return null;
};

export default VerifyAuth;
