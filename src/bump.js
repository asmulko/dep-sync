import fs from "node:fs";
import path from "node:path";
import { green, yellow, cyan, gray, bold } from "./colors.js";
import { suggestNextVersion } from "./version.js";

const DEP_TYPES = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

// Short names for output display
const DEP_SHORT_NAMES = {
  dependencies: "deps",
  devDependencies: "devDeps",
  peerDependencies: "peerDeps",
  optionalDependencies: "optionalDeps",
};

/**
 * Determine the version value based on dependency type.
 * peerDependencies always use caret to preserve range semantics.
 * @param {string} version - Base version
 * @param {boolean} exact - Whether user wants exact version
 * @param {string} depType - Dependency type
 * @returns {string} Version string to use
 */
function getVersionForType(version, exact, depType) {
  // peerDependencies should always use caret (range) to avoid breaking consumers
  if (depType === "peerDependencies") {
    return `^${version}`;
  }
  return exact ? version : `^${version}`;
}

/**
 * Bump a dependency version in multiple projects.
 * Automatically detects and updates the package in all dependency types.
 * @param {Object} options
 * @param {string} options.packageName - Name of the package to update
 * @param {string} options.version - Target version
 * @param {string[]} options.paths - Paths to project directories
 * @param {boolean} options.exact - Use exact version (no prefix)
 * @param {boolean} options.dryRun - If true, only report changes without writing
 * @param {boolean} options.noPeer - If true, skip peerDependencies
 * @returns {Object} Results summary
 */
export function bumpDependency(options) {
  const { packageName, version, paths, exact, dryRun, noPeer } = options;
  const displayVersion = exact ? version : `^${version}`;

  // Filter dep types based on options
  const activeDeps = noPeer 
    ? DEP_TYPES.filter((t) => t !== "peerDependencies")
    : DEP_TYPES;

  const results = {
    updated: [],
    notFound: [],
    errors: [],
  };

  console.log();
  if (dryRun) {
    console.log(bold(yellow("[DRY RUN]")) + gray(" No files will be modified"));
    console.log();
  }
  console.log(bold(`Updating ${cyan(packageName)} to ${cyan(displayVersion)}`));
  if (noPeer) {
    console.log(gray("Skipping peerDependencies (--no-peer)"));
  }
  console.log();

  for (const projectPath of paths) {
    const pkgJsonPath = path.resolve(projectPath, "package.json");
    const projectName = path.basename(path.resolve(projectPath));

    if (!fs.existsSync(pkgJsonPath)) {
      console.log(`${yellow("⚠")} ${bold(projectName)}: ${gray("package.json not found")}`);
      results.errors.push({ project: projectName, reason: "package.json not found" });
      continue;
    }

    let pkgJson;
    try {
      const content = fs.readFileSync(pkgJsonPath, "utf-8");
      pkgJson = JSON.parse(content);
    } catch (err) {
      console.log(`${yellow("⚠")} ${bold(projectName)}: ${gray("failed to read package.json")}`);
      results.errors.push({ project: projectName, reason: "failed to read package.json" });
      continue;
    }

    // Find package in all dependency types
    const foundIn = [];
    for (const depType of activeDeps) {
      if (pkgJson[depType] && packageName in pkgJson[depType]) {
        const newVersion = getVersionForType(version, exact, depType);
        foundIn.push({
          type: depType,
          shortType: DEP_SHORT_NAMES[depType],
          oldVersion: pkgJson[depType][packageName],
          newVersion,
        });
      }
    }

    if (foundIn.length === 0) {
      console.log(`${yellow("⚠")} ${bold(projectName)}: ${packageName} ${gray("not found")}`);
      results.notFound.push({ project: projectName });
      continue;
    }

    // Build grouped output: "✔ app1 (deps, peerDeps)"
    const sections = foundIn.map((f) => f.shortType).join(", ");
    
    if (dryRun) {
      console.log(`${green("✔")} ${bold(projectName)} ${gray(`(${sections})`)}`);
      for (const { type, oldVersion, newVersion } of foundIn) {
        const isPeer = type === "peerDependencies";
        const versionDisplay = isPeer 
          ? `${gray(oldVersion)} → ${green(newVersion)} ${gray("(range preserved)")}`
          : `${gray(oldVersion)} → ${green(newVersion)}`;
        console.log(`  ${gray(DEP_SHORT_NAMES[type])}: ${versionDisplay}`);
      }
      results.updated.push({
        project: projectName,
        changes: foundIn.map((f) => ({ type: f.type, from: f.oldVersion, to: f.newVersion })),
        filePath: pkgJsonPath,
      });
    } else {
      // Actually update the file
      for (const { type, newVersion } of foundIn) {
        pkgJson[type][packageName] = newVersion;
      }

      try {
        fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n");
        console.log(`${green("✔")} ${bold(projectName)} ${gray(`(${sections})`)}`);
        for (const { type, oldVersion, newVersion } of foundIn) {
          const isPeer = type === "peerDependencies";
          const versionDisplay = isPeer 
            ? `${gray(oldVersion)} → ${green(newVersion)} ${gray("(range preserved)")}`
            : `${gray(oldVersion)} → ${green(newVersion)}`;
          console.log(`  ${gray(DEP_SHORT_NAMES[type])}: ${versionDisplay}`);
        }
        results.updated.push({
          project: projectName,
          changes: foundIn.map((f) => ({ type: f.type, from: f.oldVersion, to: f.newVersion })),
          filePath: pkgJsonPath,
        });
      } catch (err) {
        console.log(`${yellow("⚠")} ${bold(projectName)}: ${gray("failed to write package.json")}`);
        results.errors.push({ project: projectName, reason: "failed to write package.json" });
      }
    }
  }

  // Print summary
  console.log();
  if (dryRun) {
    console.log(bold(yellow("[DRY RUN]")) + " No files were modified");
    console.log();
  }
  console.log(bold("Summary:"));
  console.log(`  ${green("✔")} ${dryRun ? "Would update" : "Updated"}: ${results.updated.length}`);
  if (results.notFound.length > 0) {
    console.log(`  ${yellow("⚠")} Not found: ${results.notFound.length}`);
  }
  if (results.errors.length > 0) {
    console.log(`  ${yellow("⚠")} Errors: ${results.errors.length}`);
  }
  console.log();

  return results;
}

/**
 * Bump the version field in a project's package.json.
 * @param {Object} options
 * @param {string} options.projectPath - Path to project directory
 * @param {string} options.bumpType - Type of bump: 'patch', 'minor', 'major', 'prerelease'
 * @param {string} options.prereleaseTag - Tag for prerelease (default: 'rc')
 * @param {boolean} options.dryRun - If true, only report changes without writing
 * @returns {{ success: boolean, oldVersion?: string, newVersion?: string, filePath?: string, error?: string }}
 */
export function bumpProjectVersion(options) {
  const { projectPath, bumpType, prereleaseTag = "rc", dryRun } = options;
  const pkgJsonPath = path.resolve(projectPath, "package.json");

  if (!fs.existsSync(pkgJsonPath)) {
    return { success: false, error: "package.json not found" };
  }

  try {
    const content = fs.readFileSync(pkgJsonPath, "utf-8");
    const pkgJson = JSON.parse(content);
    const oldVersion = pkgJson.version;

    if (!oldVersion) {
      return { success: false, error: "No version field in package.json" };
    }

    const newVersion = suggestNextVersion(oldVersion, bumpType, prereleaseTag);
    
    if (!newVersion) {
      return { success: false, error: `Could not calculate ${bumpType} version from ${oldVersion}` };
    }

    if (!dryRun) {
      pkgJson.version = newVersion;
      fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + "\n", "utf-8");
    }

    return {
      success: true,
      oldVersion,
      newVersion,
      filePath: pkgJsonPath,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Bump versions in multiple projects.
 * @param {Object} options
 * @param {string[]} options.paths - Paths to project directories
 * @param {string} options.bumpType - Type of bump: 'patch', 'minor', 'major', 'prerelease'
 * @param {string} options.prereleaseTag - Tag for prerelease (default: 'rc')
 * @param {boolean} options.dryRun - If true, only report changes without writing
 * @returns {Object} Results with updated files
 */
export function bumpVersions(options) {
  const { paths, bumpType, prereleaseTag = "rc", dryRun } = options;

  const results = {
    updated: [],
    errors: [],
  };

  console.log();
  console.log(bold(`Bumping versions (${bumpType}):`));
  console.log();

  for (const projectPath of paths) {
    const projectName = path.basename(path.resolve(projectPath));
    const result = bumpProjectVersion({ projectPath, bumpType, prereleaseTag, dryRun });

    if (result.success) {
      console.log(`${green("✔")} ${bold(projectName)}: ${result.oldVersion} → ${result.newVersion}`);
      results.updated.push({
        projectName,
        filePath: result.filePath,
        oldVersion: result.oldVersion,
        newVersion: result.newVersion,
      });
    } else {
      console.log(`${yellow("⚠")} ${projectName}: ${result.error}`);
      results.errors.push({ projectName, error: result.error });
    }
  }

  console.log();
  return results;
}
