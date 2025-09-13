# Phyloria Launcher

Phyloria Launcher est un launcher Minecraft moderne, open-source, développé avec React, TypeScript, Electron et Vite. Il propose une expérience utilisateur fluide, une authentification Microsoft/Mojang robuste, la gestion des serveurs, des comptes et des modpacks, ainsi qu'une interface responsive.

> **Ce projet est basé sur [HeliosLauncher](https://github.com/dscalzi/HeliosLauncher).**

## Fonctionnalités principales

-   **Authentification Microsoft/Mojang** : Flow sécurisé, gestion des erreurs et du rate limiting côté backend.
-   **Gestion des serveurs** : Sélection, affichage, synchronisation et lancement de serveurs Minecraft.
-   **Gestion des comptes** : Affichage du pseudo et du skin Minecraft, déconnexion, récupération des informations via IPC.
-   **Lancement du jeu** : Suivi de la progression, détails en temps réel, gestion de la fermeture du jeu.
-   **Interface utilisateur** : UI moderne, composants réutilisables, responsive, feedback utilisateur clair.
-   **Electron** : Intégration native, gestion des fenêtres, communication IPC entre le frontend React et le backend Node.js.
-   **Vite** : Build rapide, HMR, configuration TypeScript et ESLint optimisée.

## Structure du projet

```
phyloria_launcher/
├── components/
│   └── ui/ (boutons, popover, progress, etc.)
│   └── LaunchPanel.tsx, ServerSelector.tsx, UserInfo.tsx, VerifyAuth.tsx
├── electron/
│   └── main.ts, preload.ts, scripts/ (authmanager, configmanager, distromanager...)
├── hooks/
│   └── use-mobile.ts
├── lib/
│   └── utils.ts
├── src/
│   └── App.tsx, main.tsx, globals.css
│   └── context/ (GameContext)
│   └── pages/ (home, login, loading, params...)
│   └── assets/ (icon.png, microsoft.svg)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
```

## Installation

```bash
# Installe les dépendances
npm install

# Lance le mode développement (Electron + React)
npm run dev

# Build pour la production
npm run build
```

## Scripts principaux

-   `npm run dev` : Démarre le frontend React (Vite) et le backend Electron en mode développement.
-   `npm run build` : Build le projet pour la production.
-   `npm run lint` : Vérifie la qualité du code avec ESLint.

## Configuration ESLint/TypeScript

Le projet utilise une configuration avancée pour ESLint et TypeScript :

```js
export default {
    parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        project: ["./tsconfig.json", "./tsconfig.node.json"],
        tsconfigRootDir: __dirname,
    },
    // ...autres règles
};
```

## Contribution

Les contributions sont les bienvenues !

-   Forkez le projet
-   Créez une branche (`git checkout -b feature/ma-feature`)
-   Commitez vos modifications
-   Ouvrez une Pull Request

## Licence

Ce projet est sous licence MIT.

---

Pour toute question ou suggestion, ouvrez une issue sur GitHub.
