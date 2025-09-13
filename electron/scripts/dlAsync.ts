import { validateLocalFile } from "helios-core/common";
import {
    DistributionIndexProcessor,
    MojangIndexProcessor,
    downloadFile,
} from "helios-core/dl";
import {
    discoverBestJvmInstallation,
    ensureJavaDirIsRoot,
    extractJdk,
    javaExecFromRoot,
    latestOpenJDK,
    validateSelectedJvm,
} from "helios-core/java";
import * as ConfigManager from "./configmanager";
import { DistroAPI } from "./distromanager";
import { FullRepair } from "./FullRepairWrapper";
import {
    LibraryEntry,
    ProcessBuilder,
    Rule,
    VanillaManifest,
} from "./processbuilder";

interface JavaScanOptions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    effectiveJavaOptions: any;
    launchAfter?: boolean;
    onDetails?: (msg: string) => void;
    onProgress?: (percent: number) => void;
    onError?: (err: Error) => void;
}

interface JavaScanOptions {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    effectiveJavaOptions: any;
    launchAfter?: boolean;
    onDetails?: (msg: string) => void;
    onProgress?: (percent: number) => void;
    onError?: (err: Error) => void;
    onClose?: () => void;
}

export async function asyncSystemScan({
    effectiveJavaOptions,
    launchAfter = true,
    onDetails,
    onProgress,
    onError,
    onClose,
}: JavaScanOptions) {
    onDetails?.("Vérification de l’installation Java...");
    onProgress?.(0);

    // Découvre tous les JDK installés
    const allJdks = await discoverBestJvmInstallation(
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.supported
    );

    // Filtrer les JDK valides avec SemVer
    const jvmDetails = allJdks?.semver ? allJdks : null;

    if (!jvmDetails) {
        onDetails?.("Aucune installation Java compatible trouvée.");
        await downloadJava({
            effectiveJavaOptions,
            launchAfter,
            onDetails,
            onProgress,
            onError,
        });
        return;
    }

    if (!ConfigManager.isLoaded()) {
        await ConfigManager.load();
    }

    const javaExec = javaExecFromRoot(jvmDetails.path);
    ConfigManager.setJavaExecutable(
        ConfigManager.getSelectedServer() ?? "",
        javaExec
    );
    ConfigManager.save();

    onDetails?.(`Java détecté: ${javaExec}`);
    onProgress?.(100);

    if (launchAfter) {
        try {
            await dlAsync({ onDetails, onProgress, onError, onClose });
        } catch (err) {
            console.error("Error during launch", err);
        }
    }
}

interface JavaDownloadOptions extends JavaScanOptions {}

export async function downloadJava({
    effectiveJavaOptions,
    launchAfter = true,
    onDetails,
    onProgress,
    onError,
    onClose,
}: JavaDownloadOptions) {
    const asset = await latestOpenJDK(
        effectiveJavaOptions.suggestedMajor,
        ConfigManager.getDataDirectory(),
        effectiveJavaOptions.distribution
    );

    if (!asset) {
        throw new Error("Impossible de trouver un JDK compatible.");
    }

    let received = 0;
    onDetails?.("Téléchargement de Java...");
    try {
        await downloadFile(
            asset.url,
            asset.path,
            ({ transferred }: { transferred: number }) => {
                received = transferred;
                onProgress?.(Math.trunc((transferred / asset.size) * 100));
            }
        );
    } catch (err) {
        console.error("Error downloading Java:", err);
        return;
    }
    onProgress?.(100);

    if (received !== asset.size) {
        if (!(await validateLocalFile(asset.path, asset.algo, asset.hash))) {
            throw new Error("Java téléchargé est corrompu.");
        }
    }

    onDetails?.("Extraction de Java...");
    const newJavaExec = await extractJdk(asset.path);

    ConfigManager.setJavaExecutable(
        ConfigManager.getSelectedServer() ?? "",
        newJavaExec
    );
    ConfigManager.save();

    onDetails?.("Java installé avec succès.");
    onProgress?.(100);

    // Lancer le jeu après l'installation seulement si launchAfter est vrai
    if (launchAfter) {
        try {
            await dlAsync({ onDetails, onProgress, onError, onClose });
        } catch (err) {
            console.error("Error during launch", err);
        }
    }
}

const GAME_LAUNCH_REGEX =
    /^\[.+\]: (?:MinecraftForge .+ Initialized|ModLauncher .+ starting: .+|Loading Minecraft .+ with Fabric Loader .+)$/;
const MIN_LINGER = 5000;

interface DlAsyncOptions {
    onProgress?: (percent: number) => void;
    onDetails?: (message: string) => void;
    onError?: (err: Error) => void;
    onClose?: () => void;
}

export async function dlAsync(opts: DlAsyncOptions = {}, login = true) {
    const { onProgress, onDetails, onError, onClose } = opts;

    function details(msg: string) {
        console.info(msg);
        onDetails?.(msg);
    }

    details("Chargement des informations de la version...");

    let distro;
    try {
        distro = await DistroAPI.refreshDistributionOrFallback();
    } catch (err) {
        console.error("Unable to refresh distribution index.", err);
        return;
    }

    const serv = distro.getServerById(
        ConfigManager.getSelectedServer() as string
    );

    if (!serv) {
        const err = new Error("Aucun serveur sélectionné ou serveur invalide.");
        console.error(err.message);
        onError?.(err);
        return;
    }

    const selectedServerId = ConfigManager.getSelectedServer();
    const jExe = ConfigManager.getJavaExecutable(
        (selectedServerId ?? "") as string
    );

    if (!jExe || jExe === null) {
        await asyncSystemScan({
            effectiveJavaOptions: serv.effectiveJavaOptions,
            launchAfter: true,
            onDetails,
            onProgress,
            onError,
        });
        return;
    }

    const det = await validateSelectedJvm(
        ensureJavaDirIsRoot(jExe),
        serv.effectiveJavaOptions.supported
    );

    if (det === null) {
        const err = new Error(
            `L'exécutable Java configuré n'est pas valide ou compatible: ${jExe}`
        );
        console.error(err.message);
        onError?.(err);
        return;
    }

    if (login && ConfigManager.getSelectedAccount() == null) {
        console.error("Vous devez être connecté à un compte.");
        onError?.(new Error("Vous devez être connecté à un compte."));
        return;
    }

    details("Merci de patienter pendant le lancement...");
    onProgress?.(0);

    const fullRepairModule = new FullRepair(
        ConfigManager.getCommonDirectory(),
        ConfigManager.getInstanceDirectory(),
        ConfigManager.getLauncherDirectory(),
        ConfigManager.getSelectedServer() ?? "",
        DistroAPI.isDevMode()
    );

    details("Initialisation du module de réparation complète...");

    fullRepairModule.spawnReceiver();

    details("Lancement du module de réparation complète...");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fullRepairModule.childProcess.on("error", (err: any) => {
        details("Erreur lors du lancement.");
        console.error("Error during launch", err);
        onError?.(err);
    });

    details("Lancement 2 du module de réparation complète...");

    fullRepairModule.childProcess.on("close", (code: number) => {
        if (code !== 0) {
            details("Erreur lors du lancement.");
            console.error(`Full Repair Module exited with code ${code}`);
        }
    });

    details("Validation de l'intégrité des fichiers...");
    let invalidFileCount = 0;
    try {
        invalidFileCount = await fullRepairModule.verifyFiles(
            (percent: number) => {
                onProgress?.(percent);
            }
        );
        onProgress?.(100);
    } catch (err) {
        console.error("Error during file validation.");
        return;
    }

    if (invalidFileCount > 0) {
        details("Téléchargement des fichiers...");
        onProgress?.(0);
        try {
            await fullRepairModule.download((percent: number) => {
                onProgress?.(percent);
            });
            onProgress?.(100);
        } catch (err) {
            console.error("Error during file download.");
            return;
        }
    } else {
        details("No invalid files, skipping download.");
    }

    fullRepairModule.destroyReceiver();

    details("Préparation au lancement...");

    const mojangIndexProcessor = new MojangIndexProcessor(
        ConfigManager.getCommonDirectory(),
        serv.rawServer.minecraftVersion
    );
    const distributionIndexProcessor = new DistributionIndexProcessor(
        ConfigManager.getCommonDirectory(),
        distro,
        serv.rawServer.id
    );

    const modLoaderData =
        await distributionIndexProcessor.loadModLoaderVersionJson();
    const versionData = await mojangIndexProcessor.getVersionJson();

    if (login) {
        const authUser = ConfigManager.getSelectedAccount();
        if (authUser == null) {
            console.error("No account selected.");
            return;
        }
        details(`Launching as ${authUser.displayName ?? "<Unknown User>"}`);

        // Ensure versionData has the required 'arguments' property
        const versionDataWithArguments: VanillaManifest = {
            ...versionData,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            arguments: (versionData as any).arguments ?? {
                jvm: [],
                game: [],
            },
            libraries: (versionData.libraries as LibraryEntry[]).map(
                (lib: LibraryEntry) => ({
                    ...lib,
                    rules: lib.rules
                        ? lib.rules.map((rule: Rule) => ({
                              ...rule,
                              action:
                                  rule.action === "allow"
                                      ? "allow"
                                      : rule.action === "disallow"
                                      ? "disallow"
                                      : "disallow",
                          }))
                        : undefined,
                })
            ),
        };

        // Ensure modLoaderData has the required 'arguments' property
        const modLoaderDataWithArguments = {
            ...modLoaderData,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            arguments: (modLoaderData as any).arguments ?? {
                jvm: [],
                game: [],
            },
        };

        const pb = new ProcessBuilder(
            serv,
            versionDataWithArguments,
            modLoaderDataWithArguments,
            authUser,
            "1.0.0" // remplace avec app.getVersion()
        );

        try {
            const proc = pb.build();

            const start = Date.now();
            const tempListener = (data: Buffer) => {
                const line = data.toString().trim();
                if (GAME_LAUNCH_REGEX.test(line)) {
                    const diff = Date.now() - start;
                    if (diff < MIN_LINGER) {
                        setTimeout(
                            () => details("Jeu démarré !"),
                            MIN_LINGER - diff
                        );
                    } else {
                        details("Jeu démarré !");
                    }
                    if (proc.stdout) {
                        proc.stdout.removeListener("data", tempListener);
                    }
                }
            };

            if (proc.stdout && proc.stderr) {
                proc.stdout.on("data", tempListener);

                proc.stderr.on("data", (data: Buffer) => {
                    const line = data.toString().trim();
                    if (
                        line.includes(
                            "Could not find or load main class net.minecraft.launchwrapper.Launch"
                        )
                    ) {
                        onError?.(
                            new Error(
                                "LaunchWrapper was not downloaded properly."
                            )
                        );
                    }
                });

                details("Parfait, profitez bien !");

                proc.on("close", () => {
                    onClose?.();
                    return;
                });
            }
        } catch (err) {
            console.error("Error during launch", err);
        }
    }
}
