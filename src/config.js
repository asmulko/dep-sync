import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Load config from a JS or JSON file.
 * Supports: .json, .mjs (ES modules), .cjs (CommonJS), .js (tries both)
 * @param {string} configPath - Path to the config file
 * @returns {Promise<Object>} Config object
 */
export async function loadConfig(configPath) {
  const absolutePath = path.resolve(configPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  const ext = path.extname(absolutePath).toLowerCase();

  // Handle JSON files
  if (ext === ".json") {
    const content = fs.readFileSync(absolutePath, "utf-8");
    try {
      return JSON.parse(content);
    } catch (err) {
      throw new Error(`Invalid JSON in config file: ${err.message}`);
    }
  }

  // Handle .cjs files (CommonJS)
  if (ext === ".cjs") {
    try {
      // Clear require cache to allow reloading
      delete require.cache[absolutePath];
      return require(absolutePath);
    } catch (err) {
      throw new Error(`Error loading CommonJS config: ${err.message}`);
    }
  }

  // Handle .mjs files (ES modules)
  if (ext === ".mjs") {
    const fileUrl = pathToFileURL(absolutePath).href;
    const module = await import(fileUrl);
    return module.default || module;
  }

  // Handle .js files - try ES module first, fall back to CommonJS
  const fileUrl = pathToFileURL(absolutePath).href;
  try {
    const module = await import(fileUrl);
    return module.default || module;
  } catch (err) {
    // If ES module import fails, try CommonJS
    if (err.message.includes("Unexpected token 'export'") || 
        err.message.includes("Cannot use import statement") ||
        err.code === "ERR_REQUIRE_ESM") {
      try {
        delete require.cache[absolutePath];
        return require(absolutePath);
      } catch (requireErr) {
        // Both failed - give helpful error message
        throw new Error(
          `Could not load config file. Use .json, .mjs (ES modules), or .cjs (CommonJS).\n` +
          `  ES module error: ${err.message}\n` +
          `  CommonJS error: ${requireErr.message}`
        );
      }
    }
    throw err;
  }
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
