import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";

// https://vitejs.dev/config/
export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "."),
        },
    },
    plugins: [
        tailwindcss(),
        react(),
        electron({
            main: {
                entry: "electron/main.ts",
            },
            preload: {
                input: path.join(__dirname, "electron/preload.ts"),
            },

            renderer: process.env.NODE_ENV === "test" ? undefined : {},
        }),
    ],
});
