/**
 * AuthManager
 *
 * This module aims to abstract authentication procedures. Results from Microsoft's REST API
 * are retrieved through our Microsoft module. These results are processed and stored,
 * if applicable, in the config using the ConfigManager. All authentication procedures should
 * be made through this module.
 *
 * @module authmanager
 */

import { RestResponseStatus } from "helios-core/common";
import { createRequire } from "node:module";
import * as ConfigManager from "./configmanager";
import { AZURE_CLIENT_ID } from "./ipcconstants";

const require = createRequire(import.meta.url);

const { MicrosoftAuth, MicrosoftErrorCode } = require("helios-core/microsoft");

// Rate limiting management
interface RateLimitInfo {
    lastAttempt: number;
    attemptCount: number;
    backoffUntil: number;
}

const rateLimitInfo: RateLimitInfo = {
    lastAttempt: 0,
    attemptCount: 0,
    backoffUntil: 0,
};

// Exponential backoff delays in milliseconds
const BACKOFF_DELAYS = [30000, 60000, 120000, 300000, 600000]; // 30s, 1m, 2m, 5m, 10m

// Error messages with proper localization
function microsoftErrorDisplayable(
    errorCode: typeof MicrosoftErrorCode,
    context?: string
): {
    title: string;
    desc: string;
    recoverable: boolean;
} {
    switch (errorCode) {
        case MicrosoftErrorCode.NO_PROFILE:
            return {
                title: "Profil Minecraft manquant",
                desc: "Votre compte Microsoft n'a pas de profil Minecraft configuré. Veuillez vous rendre sur minecraft.net pour configurer votre profil ou acheter le jeu.",
                recoverable: false,
            };
        case MicrosoftErrorCode.NO_XBOX_ACCOUNT:
            return {
                title: "Compte Xbox manquant",
                desc: "Votre compte Microsoft n'a pas de compte Xbox associé. Veuillez créer un profil Xbox Live.",
                recoverable: false,
            };
        case MicrosoftErrorCode.XBL_BANNED:
            return {
                title: "Compte Xbox suspendu",
                desc: "Votre compte Xbox Live a été suspendu. Consultez le support Xbox pour plus d'informations.",
                recoverable: false,
            };
        case MicrosoftErrorCode.UNDER_18:
            return {
                title: "Autorisation parentale requise",
                desc: "Ce compte nécessite l'autorisation parentale pour accéder à Minecraft.",
                recoverable: false,
            };
        case MicrosoftErrorCode.UNKNOWN:
        default:
            // Check if it's a rate limiting error
            if (
                context &&
                (context.includes("429") ||
                    context.toLowerCase().includes("too many requests"))
            ) {
                return {
                    title: "Limite de requêtes atteinte",
                    desc: `Trop de tentatives de connexion. Veuillez patienter ${Math.ceil(
                        getBackoffTime() / 60000
                    )} minutes avant de réessayer.`,
                    recoverable: true,
                };
            }
            return {
                title: "Erreur d'authentification",
                desc: "Une erreur inconnue s'est produite lors de l'authentification. Veuillez réessayer plus tard.",
                recoverable: true,
            };
    }
}

// Rate limiting functions
function updateRateLimit(isError: boolean = false): void {
    const now = Date.now();
    rateLimitInfo.lastAttempt = now;

    if (isError) {
        rateLimitInfo.attemptCount++;
        const delayIndex = Math.min(
            rateLimitInfo.attemptCount - 1,
            BACKOFF_DELAYS.length - 1
        );
        rateLimitInfo.backoffUntil = now + BACKOFF_DELAYS[delayIndex];
        console.warn(
            `Rate limit hit. Backing off for ${
                BACKOFF_DELAYS[delayIndex] / 1000
            }s. Attempt ${rateLimitInfo.attemptCount}`
        );
    } else {
        // Reset on success
        rateLimitInfo.attemptCount = 0;
        rateLimitInfo.backoffUntil = 0;
    }
}

function isRateLimited(): boolean {
    return Date.now() < rateLimitInfo.backoffUntil;
}

function getBackoffTime(): number {
    return Math.max(0, rateLimitInfo.backoffUntil - Date.now());
}

function getRateLimitStatus(): {
    isLimited: boolean;
    waitTime: number;
    attemptCount: number;
} {
    return {
        isLimited: isRateLimited(),
        waitTime: getBackoffTime(),
        attemptCount: rateLimitInfo.attemptCount,
    };
}

// Enhanced error handling wrapper
async function executeWithRateLimit<T>(
    operation: () => Promise<T>,
    operationName: string
): Promise<T> {
    if (isRateLimited()) {
        const waitTime = getBackoffTime();
        console.warn(
            `Operation ${operationName} blocked by rate limit. Wait ${waitTime}ms`
        );
        throw new Error(`RATE_LIMITED:${Math.ceil(waitTime / 1000)}`);
    }

    try {
        const result = await operation();
        updateRateLimit(false); // Success
        return result;
    } catch (error) {
        // Check if it's a rate limiting error
        const errorStr = String(error);
        if (
            errorStr.includes("429") ||
            errorStr.toLowerCase().includes("too many requests")
        ) {
            updateRateLimit(true);
            console.error(`Rate limit error in ${operationName}:`, error);
            throw new Error(
                `RATE_LIMITED:${Math.ceil(getBackoffTime() / 1000)}`
            );
        }

        throw error;
    }
}

const AUTH_MODE = { FULL: 0, MS_REFRESH: 1, MC_REFRESH: 2 } as const;
type AuthMode = (typeof AUTH_MODE)[keyof typeof AUTH_MODE];

/**
 * Perform the full MS Auth flow in a given mode with rate limiting protection.
 */
async function fullMicrosoftAuthFlow(
    entryCode: string,
    authMode: AuthMode
): Promise<unknown> {
    const operationName = `MicrosoftAuthFlow-${
        authMode === AUTH_MODE.FULL
            ? "FULL"
            : authMode === AUTH_MODE.MS_REFRESH
            ? "MS_REFRESH"
            : "MC_REFRESH"
    }`;

    return executeWithRateLimit(async () => {
        try {
            let accessTokenRaw;
            let accessToken;

            if (authMode !== AUTH_MODE.MC_REFRESH) {
                console.log(`Getting access token for ${operationName}`);
                const accessTokenResponse = await MicrosoftAuth.getAccessToken(
                    entryCode,
                    authMode === AUTH_MODE.MS_REFRESH,
                    AZURE_CLIENT_ID
                );

                if (
                    accessTokenResponse.responseStatus ===
                    RestResponseStatus.ERROR
                ) {
                    const errorInfo = microsoftErrorDisplayable(
                        accessTokenResponse.microsoftErrorCode ??
                            MicrosoftErrorCode.UNKNOWN,
                        JSON.stringify(accessTokenResponse)
                    );
                    throw new Error(`AUTH_ERROR:${JSON.stringify(errorInfo)}`);
                }

                accessToken = accessTokenResponse.data;
                if (!accessToken) {
                    throw new Error(
                        `AUTH_ERROR:${JSON.stringify(
                            microsoftErrorDisplayable(
                                MicrosoftErrorCode.UNKNOWN
                            )
                        )}`
                    );
                }
                accessTokenRaw = accessToken.access_token;
            } else {
                accessTokenRaw = entryCode;
            }

            console.log(`Getting XBL token for ${operationName}`);
            const xblResponse = await MicrosoftAuth.getXBLToken(accessTokenRaw);
            if (xblResponse.responseStatus === RestResponseStatus.ERROR) {
                const errorInfo = microsoftErrorDisplayable(
                    xblResponse.microsoftErrorCode ??
                        MicrosoftErrorCode.UNKNOWN,
                    JSON.stringify(xblResponse)
                );
                throw new Error(`AUTH_ERROR:${JSON.stringify(errorInfo)}`);
            }

            if (!xblResponse.data) {
                throw new Error(
                    `AUTH_ERROR:${JSON.stringify(
                        microsoftErrorDisplayable(MicrosoftErrorCode.UNKNOWN)
                    )}`
                );
            }

            console.log(`Getting XSTS token for ${operationName}`);
            const xstsResponse = await MicrosoftAuth.getXSTSToken(
                xblResponse.data
            );
            if (xstsResponse.responseStatus === RestResponseStatus.ERROR) {
                const errorInfo = microsoftErrorDisplayable(
                    xstsResponse.microsoftErrorCode ??
                        MicrosoftErrorCode.UNKNOWN,
                    JSON.stringify(xstsResponse)
                );
                throw new Error(`AUTH_ERROR:${JSON.stringify(errorInfo)}`);
            }

            if (!xstsResponse.data) {
                throw new Error(
                    `AUTH_ERROR:${JSON.stringify(
                        microsoftErrorDisplayable(MicrosoftErrorCode.UNKNOWN)
                    )}`
                );
            }

            console.log(`Getting MC access token for ${operationName}`);
            const mcTokenResponse = await MicrosoftAuth.getMCAccessToken(
                xstsResponse.data
            );
            if (mcTokenResponse.responseStatus === RestResponseStatus.ERROR) {
                const errorInfo = microsoftErrorDisplayable(
                    mcTokenResponse.microsoftErrorCode ??
                        MicrosoftErrorCode.UNKNOWN,
                    JSON.stringify(mcTokenResponse)
                );
                throw new Error(`AUTH_ERROR:${JSON.stringify(errorInfo)}`);
            }

            if (!mcTokenResponse.data) {
                throw new Error(
                    `AUTH_ERROR:${JSON.stringify(
                        microsoftErrorDisplayable(MicrosoftErrorCode.UNKNOWN)
                    )}`
                );
            }

            console.log(`Getting MC profile for ${operationName}`);
            const mcProfileResponse = await MicrosoftAuth.getMCProfile(
                mcTokenResponse.data.access_token
            );
            if (mcProfileResponse.responseStatus === RestResponseStatus.ERROR) {
                const errorInfo = microsoftErrorDisplayable(
                    mcProfileResponse.microsoftErrorCode ??
                        MicrosoftErrorCode.UNKNOWN,
                    JSON.stringify(mcProfileResponse)
                );
                throw new Error(`AUTH_ERROR:${JSON.stringify(errorInfo)}`);
            }

            console.log(`Successfully completed ${operationName}`);
            return {
                accessToken,
                accessTokenRaw,
                xbl: xblResponse.data,
                xsts: xstsResponse.data,
                mcToken: mcTokenResponse.data,
                mcProfile: mcProfileResponse.data,
            };
        } catch (err) {
            console.error(`Error in ${operationName}:`, err);

            // Re-throw structured errors
            if (
                String(err).startsWith("AUTH_ERROR:") ||
                String(err).startsWith("RATE_LIMITED:")
            ) {
                throw err;
            }

            // Handle network/unknown errors
            const errorStr = String(err);
            if (
                errorStr.includes("429") ||
                errorStr.toLowerCase().includes("too many requests")
            ) {
                throw new Error(
                    `RATE_LIMITED:${Math.ceil(getBackoffTime() / 1000)}`
                );
            }

            throw new Error(
                `AUTH_ERROR:${JSON.stringify(
                    microsoftErrorDisplayable(
                        MicrosoftErrorCode.UNKNOWN,
                        errorStr
                    )
                )}`
            );
        }
    }, operationName);
}

/**
 * Calculate the expiry date. Advance the expiry time by 10 seconds
 * to reduce the likelihood of working with an expired token.
 */
function calculateExpiryDate(nowMs: number, expiresInS: number): number {
    return nowMs + (expiresInS - 10) * 1000;
}

/**
 * Add a Microsoft account with enhanced error handling and rate limiting.
 */
export async function addMicrosoftAccount(authCode: string): Promise<object> {
    try {
        const rateLimitStatus = getRateLimitStatus();
        if (rateLimitStatus.isLimited) {
            throw new Error(
                `RATE_LIMITED:${Math.ceil(rateLimitStatus.waitTime / 1000)}`
            );
        }

        console.log("Starting Microsoft account addition process");
        const fullAuth = (await fullMicrosoftAuthFlow(
            authCode,
            AUTH_MODE.FULL
        )) as {
            accessToken: {
                access_token: string;
                refresh_token: string;
                expires_in: number;
            };
            accessTokenRaw: string;
            xbl: unknown;
            xsts: unknown;
            mcToken: { access_token: string; expires_in: number };
            mcProfile: { id: string; name: string };
        };

        const now = new Date().getTime();

        const ret = ConfigManager.addMicrosoftAuthAccount(
            fullAuth.mcProfile.id,
            fullAuth.mcToken.access_token,
            fullAuth.mcProfile.name,
            new Date(calculateExpiryDate(now, fullAuth.mcToken.expires_in)),
            fullAuth.accessToken.access_token,
            fullAuth.accessToken.refresh_token,
            new Date(calculateExpiryDate(now, fullAuth.accessToken.expires_in))
        );

        ConfigManager.save();

        if (ret === undefined) {
            throw new Error(
                `AUTH_ERROR:${JSON.stringify(
                    microsoftErrorDisplayable(MicrosoftErrorCode.UNKNOWN)
                )}`
            );
        }

        console.log(
            "Successfully added Microsoft account:",
            fullAuth.mcProfile.name
        );
        return ret;
    } catch (error) {
        console.error("Failed to add Microsoft account:", error);
        throw error;
    }
}

/**
 * Remove a Microsoft account.
 */
export async function removeMicrosoftAccount(uuid: string): Promise<void> {
    try {
        console.log("Removing Microsoft account:", uuid);
        ConfigManager.removeAuthAccount(uuid);
        ConfigManager.save();
        console.log("Successfully removed Microsoft account");
    } catch (err) {
        console.error("Error while removing account", err);
        throw err;
    }
}

/**
 * Validate the selected Microsoft account with enhanced token refresh logic.
 */
async function validateSelectedMicrosoftAccount(): Promise<boolean> {
    const current = ConfigManager.getSelectedAccount();
    if (!current) {
        console.error("No selected account found.");
        return false;
    }

    const now = new Date().getTime();

    // Check MC token expiration
    const mcExpiresAt =
        current.expiresAt instanceof Date
            ? current.expiresAt.getTime()
            : current.expiresAt !== undefined
            ? new Date(current.expiresAt).getTime()
            : 0;
    const mcExpired = now >= mcExpiresAt;

    console.log(
        `MC token expires at: ${new Date(
            mcExpiresAt
        ).toISOString()}, expired: ${mcExpired}`
    );

    if (!mcExpired) {
        console.log("MC token is still valid");
        return true;
    }

    // MC token expired. Check MS token.
    const msExpiresAt = current.microsoft?.expires_at
        ? new Date(current.microsoft.expires_at).getTime()
        : undefined;
    const msExpired = msExpiresAt !== undefined ? now >= msExpiresAt : true;

    console.log(
        `MS token expires at: ${
            msExpiresAt ? new Date(msExpiresAt).toISOString() : "unknown"
        }, expired: ${msExpired}`
    );

    // Check rate limiting before attempting refresh
    const rateLimitStatus = getRateLimitStatus();
    if (rateLimitStatus.isLimited) {
        console.warn(
            `Token refresh blocked by rate limit. Wait ${Math.ceil(
                rateLimitStatus.waitTime / 1000
            )}s`
        );
        return false;
    }

    try {
        if (msExpired) {
            // MS expired, do full refresh
            console.log("Attempting full MS token refresh");
            if (!current.microsoft?.refresh_token) {
                console.error("Microsoft refresh token is missing.");
                return false;
            }

            const res = (await fullMicrosoftAuthFlow(
                current.microsoft.refresh_token,
                AUTH_MODE.MS_REFRESH
            )) as {
                mcToken: { access_token: string; expires_in: number };
                accessToken: {
                    access_token: string;
                    refresh_token: string;
                    expires_in: number;
                };
            };

            ConfigManager.updateMicrosoftAuthAccount(
                current.uuid,
                res.mcToken.access_token,
                res.accessToken.access_token,
                res.accessToken.refresh_token,
                new Date(calculateExpiryDate(now, res.accessToken.expires_in)),
                new Date(calculateExpiryDate(now, res.mcToken.expires_in))
            );
            ConfigManager.save();
            console.log("Successfully refreshed both MS and MC tokens");
            return true;
        } else {
            // Only MC expired, use existing MS token
            console.log("Attempting MC token refresh with existing MS token");
            if (!current.microsoft?.access_token) {
                console.error("Microsoft access token is missing.");
                return false;
            }

            const res = (await fullMicrosoftAuthFlow(
                current.microsoft.access_token,
                AUTH_MODE.MC_REFRESH
            )) as {
                mcToken: { access_token: string; expires_in: number };
            };

            ConfigManager.updateMicrosoftAuthAccount(
                current.uuid,
                res.mcToken.access_token,
                current.microsoft.access_token,
                current.microsoft.refresh_token,
                current.microsoft.expires_at,
                new Date(calculateExpiryDate(now, res.mcToken.expires_in))
            );
            ConfigManager.save();
            console.log("Successfully refreshed MC token");
            return true;
        }
    } catch (error) {
        console.error("Token refresh failed:", error);

        // Handle structured errors
        const errorStr = String(error);
        if (errorStr.startsWith("RATE_LIMITED:")) {
            console.warn("Token refresh failed due to rate limiting");
        } else if (errorStr.startsWith("AUTH_ERROR:")) {
            console.error("Token refresh failed due to authentication error");
        }

        return false;
    }
}

/**
 * Validate the selected auth account with enhanced error handling.
 */
export async function validateSelected(): Promise<boolean> {
    try {
        const current = ConfigManager.getSelectedAccount();
        if (!current) {
            console.log("No account selected");
            return false;
        }

        if (current.type === "microsoft") {
            return await validateSelectedMicrosoftAccount();
        }

        console.warn("Unknown account type:", current.type);
        return false;
    } catch (error) {
        console.error("Account validation failed:", error);
        return false;
    }
}
