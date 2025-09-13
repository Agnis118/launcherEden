import { Toaster } from "@/components/ui/sonner";
import VerifyAuth from "@/src/components/VerifyAuth";
import Home from "@/src/pages/home";
import Loading from "@/src/pages/loading";
import Login from "@/src/pages/login";
import { HashRouter, Route, Routes } from "react-router-dom";
import { GameProvider } from "./context/GameContext";

function App() {
    return (
        <>
            <GameProvider>
                <HashRouter>
                    <VerifyAuth />
                    <Routes>
                        <Route path="/" element={<Loading />} />
                        <Route path="/home" element={<Home />} />
                        <Route path="/login" element={<Login />} />
                    </Routes>
                </HashRouter>
            </GameProvider>
            <Toaster position="bottom-right" richColors />
        </>
    );
}

export default App;
