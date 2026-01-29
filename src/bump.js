import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
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
    let alreadyAtVersion = false;
    for (const depType of activeDeps) {
      if (pkgJson[depType] && packageName in pkgJson[depType]) {
        const newVersion = getVersionForType(version, exact, depType);
        const oldVersion = pkgJson[depType][packageName];
        
        // Skip if version is already at target
        if (oldVersion === newVersion) {
          alreadyAtVersion = true;
          continue;
        }
        
        foundIn.push({
          type: depType,
          shortType: DEP_SHORT_NAMES[depType],
          oldVersion,
          newVersion,
        });
      }
    }

    if (foundIn.length === 0) {
      if (alreadyAtVersion) {
        console.log(`${gray("–")} ${bold(projectName)}: ${gray("already at target version")}`);
        results.skipped = results.skipped || [];
        results.skipped.push({ project: projectName });
      } else {
        console.log(`${yellow("⚠")} ${bold(projectName)}: ${packageName} ${gray("not found")}`);
        results.notFound.push({ project: projectName });
      }
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
  if (results.skipped && results.skipped.length > 0) {
    console.log(`  ${gray("–")} Already at version: ${results.skipped.length}`);
  }
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
 * Bump the version field in a project's package.json using npm version.
 * npm version will create a commit and tag automatically.
 * @param {Object} options
 * @param {string} options.projectPath - Path to project directory
 * @param {string} options.bumpType - Type of bump: 'patch', 'minor', 'major', 'prerelease'
 * @param {string} options.preid - Prerelease identifier (e.g., 'rc', 'beta', 'alpha')
 * @param {boolean} options.dryRun - If true, only report changes without running npm version
 * @returns {{ success: boolean, oldVersion?: string, newVersion?: string, filePath?: string, error?: string }}
 */
export function bumpProjectVersion(options) {
  const { projectPath, bumpType, preid, dryRun } = options;
  const absolutePath = path.resolve(projectPath);
  const pkgJsonPath = path.resolve(absolutePath, "package.json");

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

    // Calculate what the new version would be for display (use preid if provided)
    const newVersion = suggestNextVersion(oldVersion, bumpType, preid || "0");
    
    if (!newVersion) {
      return { success: false, error: `Could not calculate ${bumpType} version from ${oldVersion}` };
    }

    if (!dryRun) {
      // Run npm version - it will create commit and tag automatically
      const preidArg = bumpType === "prerelease" && preid ? ` --preid ${preid}` : "";
      execSync(`npm version ${bumpType}${preidArg}`, {
        cwd: absolutePath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      
      // Read the actual new version from package.json (npm version may differ from our calculation)
      const updatedContent = fs.readFileSync(pkgJsonPath, "utf-8");
      const updatedPkgJson = JSON.parse(updatedContent);
      
      return {
        success: true,
        oldVersion,
        newVersion: updatedPkgJson.version,
        filePath: pkgJsonPath,
      };
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
 * Bump versions in multiple projects using npm version.
 * Each project gets its own commit and tag from npm.
 * @param {Object} options
 * @param {string[]} options.paths - Paths to project directories
 * @param {string} options.bumpType - Type of bump: 'patch', 'minor', 'major', 'prerelease'
 * @param {string} options.preid - Prerelease identifier (e.g., 'rc', 'beta', 'alpha')
 * @param {boolean} options.dryRun - If true, only report changes without running npm version
 * @returns {Object} Results with updated files
 */
export function bumpVersions(options) {
  const { paths, bumpType, preid, dryRun } = options;

  const results = {
    updated: [],
    errors: [],
  };

  console.log();
  const preidDisplay = bumpType === "prerelease" && preid ? ` --preid ${preid}` : "";
  console.log(bold(`Bumping versions (${bumpType}${preidDisplay}):`));
  if (!dryRun) {
    console.log(gray("  (npm will create commits and tags)"));
  } else {
    console.log(gray("  (would create commits and tags via npm)"));
  }
  console.log();

  for (const projectPath of paths) {
    const projectName = path.basename(path.resolve(projectPath));
    const result = bumpProjectVersion({ projectPath, bumpType, preid, dryRun });

    if (result.success) {
      const tagInfo = !dryRun ? ` ${gray(`(committed & tagged v${result.newVersion})`)}` : "";
      console.log(`${green("✔")} ${bold(projectName)}: ${result.oldVersion} → ${result.newVersion}${tagInfo}`);
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
