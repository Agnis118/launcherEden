<p align="center">
  <img src="./src/assets/icon.png" width="150px" height="150px" alt="Phyloria Launcher Logo">
</p>

<h1 align="center">Phyloria Launcher</h1>
<em><h5 align="center">Un launcher Minecraft moderne, open-source</h5></em>

<p align="center">
  <img src="https://img.shields.io/github/actions/workflow/status/Alpha3608/PhyloriaLauncher/build.yml?branch=master&style=for-the-badge" alt="gh actions">
  <img src="https://img.shields.io/github/downloads/Alpha3608/PhyloriaLauncher/total.svg?style=for-the-badge" alt="downloads">
  <img src="https://forthebadge.com/images/badges/made-with-typescript.svg" height="28px" alt="typescript">
</p>

<p align="center">
  Lancez Minecraft, gérez vos serveurs et modpacks sans vous soucier de l'installation de Java, Forge ou autres mods. Phyloria s'occupe de tout pour vous.
</p>

> **Ce projet est basé sur [HeliosLauncher](https://github.com/dscalzi/HeliosLauncher).**

---

## Aperçu

![Screenshot 1](https://i.imgur.com/xikNlTZ.png)
![Screenshot 2](https://i.imgur.com/gESjh1n.png)
![Screenshot 3](https://i.imgur.com/0OgwIIf.png)

---

## Fonctionnalités

-   🔒 **Gestion complète des comptes**
    -   Ajoutez plusieurs comptes et basculez facilement entre eux.
    -   Authentification Microsoft (OAuth 2.0) et Mojang (Yggdrasil) entièrement supportées.
    -   Les identifiants ne sont jamais stockés ni transmis directement à Mojang.
-   📂 **Gestion efficace des assets**
    -   Mises à jour du client dès leur publication.
    -   Validation des fichiers avant le lancement, réparation automatique des fichiers corrompus.
-   ☕ **Validation automatique de Java**
    -   Installation automatique de la bonne version de Java si nécessaire.
    -   Java n'est pas requis sur votre système pour utiliser le launcher.
-   📰 **Fil d'actualités intégré**
-   ⚙️ **Gestion intuitive des paramètres**
    -   Panneau de contrôle Java, configuration avancée.
-   🎮 **Gestion des serveurs et modpacks**
    -   Sélection et synchronisation des serveurs Minecraft.
    -   Affichage du nombre de joueurs en ligne.
-   🔄 **Mises à jour automatiques**
-   📊 **Suivi de la progression du jeu et logs en temps réel**
-   🖥️ **Interface moderne et responsive**
    -   Composants réutilisables, feedback utilisateur clair.
-   ⚡ **Electron + Vite**
    -   Build rapide, HMR, communication IPC entre React et Node.js.

---

## Téléchargement

Les releases sont disponibles sur [GitHub Releases](https://github.com/Alpha3608/Phyloria_Launcher/releases).

| Plateforme  | Fichier                                     |
| ----------- | ------------------------------------------- |
| Windows x64 | `Phyloria-Launcher-setup-VERSION.exe`       |
| macOS x64   | `Phyloria-Launcher-setup-VERSION-x64.dmg`   |
| macOS arm64 | `Phyloria-Launcher-setup-VERSION-arm64.dmg` |
| Linux x64   | `Phyloria-Launcher-setup-VERSION.AppImage`  |

---

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

---

## Console

Pour ouvrir la console, utilisez le raccourci suivant :

```console
ctrl + shift + i
```

Pour exporter la sortie de la console, faites un clic droit et sélectionnez **Save as..**.

---

## Installation & Développement

### Prérequis

-   [Node.js](https://nodejs.org/en/) v20+

### Installation

```bash
git clone https://github.com/Alpha3608/Phyloria_Launcher.git
cd Phyloria_Launcher
npm install
```

### Lancement en développement

```bash
npm run dev
```

### Build pour la production

```bash
npm run build
```

### Build pour une plateforme spécifique

| Plateforme  | Commande             |
| ----------- | -------------------- |
| Windows x64 | `npm run dist:win`   |
| macOS       | `npm run dist:mac`   |
| Linux x64   | `npm run dist:linux` |

---

## Scripts principaux

-   `npm run dev` : Démarre le frontend React (Vite) et le backend Electron en mode développement.
-   `npm run build` : Build le projet pour la production.
-   `npm run lint` : Vérifie la qualité du code avec ESLint.

---

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

## Changer l'URL de distribution.json

Pour modifier l'URL utilisée pour récupérer le fichier `distribution.json`, ouvrez le fichier suivant :

```js
// chemin : electron/scripts/distromanager.js

export const REMOTE_DISTRO_URL = "http://91.166.194.78:50300/distribution.json";
```

Remplacez la valeur de `REMOTE_DISTRO_URL` par l'URL souhaitée.  
Exemple :

```js
export const REMOTE_DISTRO_URL = "https://votre-nouvelle-url/distribution.json";
```

Enregistrez le fichier et relancez le launcher pour appliquer la modification.

## Changer l'AZURE_CLIENT_ID

Pour modifier la valeur de `AZURE_CLIENT_ID`, ouvrez le fichier suivant :

```js
// chemin : electron/scripts/authmanager.js

export const AZURE_CLIENT_ID = "1ce6e35a-126f-48fd-97fb-54d143ac6d45"; // dd058de7-578c-4da2-9ce7-803142a3274c
```

Remplacez la valeur de `AZURE_CLIENT_ID` par votre propre identifiant Azure.  
Exemple :

```js
export const AZURE_CLIENT_ID = "votre-nouveau-client-id";
```

Enregistrez le fichier et relancez le launcher pour appliquer la modification.

---

## Contribution

Les contributions sont les bienvenues !

-   Forkez le projet
-   Créez une branche (`git checkout -b feature/ma-feature`)
-   Commitez vos modifications
-   Ouvrez une Pull Request

---

## Licence

Ce projet est sous licence MIT.

---

## Ressources

-   [Wiki HeliosLauncher](https://github.com/dscalzi/HeliosLauncher/wiki)
-   [HeliosLauncher](https://github.com/dscalzi/HeliosLauncher)
-   [Node.js](https://nodejs.org/en/)
-   [Visual Studio Code](https://code.visualstudio.com/)

Pour toute question ou suggestion, ouvrez une issue sur GitHub.

---

[![discord](https://discordapp.com/api/guilds/624931585715601428/embed.png?style=banner3)][discord]
