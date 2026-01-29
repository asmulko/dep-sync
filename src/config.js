import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Load config from a JS file.
 * @param {string} configPath - Path to the config file
 * @returns {Promise<Object>} Config object
 */
export async function loadConfig(configPath) {
  const absolutePath = path.resolve(configPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  const fileUrl = pathToFileURL(absolutePath).href;
  const module = await import(fileUrl);

  return module.default || module;
}

/**
 * Merge CLI options with config file options.
 * CLI options take precedence.
 * @param {Object} cliOptions - Options from CLI
 * @param {Object} configOptions - Options from config file
 * @returns {Object} Merged options
 */
export function mergeOptions(cliOptions, configOptions) {
  return {
    packageName: cliOptions.packageName || configOptions.packageName,
    version: cliOptions.version || configOptions.version,
    paths: cliOptions.paths?.length ? cliOptions.paths : (configOptions.paths || []),
    exact: cliOptions.exact ?? configOptions.exact ?? false,
    dryRun: cliOptions.dryRun ?? configOptions.dryRun ?? false,
    sync: cliOptions.sync ?? configOptions.sync ?? true, // sync ON by default
    commit: cliOptions.commit ?? configOptions.commit ?? false,
    singleCommit: cliOptions.singleCommit ?? configOptions.singleCommit ?? false,
    push: cliOptions.push ?? configOptions.push ?? false,
    message: cliOptions.message || configOptions.message,
    branch: cliOptions.branch || configOptions.branch,
    noPeer: cliOptions.noPeer ?? configOptions.noPeer ?? false,
  };
}
