"use strict";
const getFromEnv = parseInt(process.env.ELECTRON_IS_DEV || "0", 10) === 1;
const isEnvSet = "ELECTRON_IS_DEV" in process.env;

module.exports = isEnvSet
    ? getFromEnv
    : process.defaultApp ||
      /node_modules[\\/]electron[\\/]/.test(process.execPath);
