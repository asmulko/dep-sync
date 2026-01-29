import enquirer from "enquirer";
import fs from "node:fs";
import path from "node:path";
import { cyan, bold, gray, yellow, green } from "./colors.js";
import { getVersionChangeType, getVersionLabel, suggestNextVersion } from "./version.js";

const { MultiSelect, Select, Input, Confirm } = enquirer;

/**
 * Discover projects in given paths by checking for package.json.
 * @param {string[]} paths - Paths to check
 * @returns {Object[]} Array of project info
 */
export function discoverProjects(paths) {
  const projects = [];

  for (const projectPath of paths) {
    const pkgJsonPath = path.resolve(projectPath, "package.json");
    const projectName = path.basename(path.resolve(projectPath));

    if (fs.existsSync(pkgJsonPath)) {
      try {
        const content = fs.readFileSync(pkgJsonPath, "utf-8");
        const pkgJson = JSON.parse(content);
        projects.push({
          path: projectPath,
          name: pkgJson.name || projectName,
          version: pkgJson.version,
          packageJson: pkgJson,
        });
      } catch {
        projects.push({
          path: projectPath,
          name: projectName,
          packageJson: null,
          error: "Failed to parse package.json",
        });
      }
    }
  }

  return projects;
}

/**
 * Find current versions of a package across projects.
 * @param {Object[]} projects - Projects from discoverProjects
 * @param {string} packageName - Package to look for
 * @returns {Array<{project: string, version: string, depType: string}>}
 */
function findCurrentVersions(projects, packageName) {
  const DEP_TYPES = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
  const results = [];

  for (const project of projects) {
    if (!project.packageJson) continue;

    for (const depType of DEP_TYPES) {
      const deps = project.packageJson[depType];
      if (deps && deps[packageName]) {
        results.push({
          project: project.name,
          version: deps[packageName],
          depType,
        });
        break; // Only count once per project
      }
    }
  }

  return results;
}

/**
 * Interactive mode - prompt user to select projects and options.
 * @param {Object} options - Initial options (may be partial)
 * @returns {Promise<Object>} Complete options from user input
 */
export async function interactiveMode(options) {
  console.log();
  console.log(bold("dep-sync") + gray(" - Interactive Mode"));
  console.log();

  // Check if paths provided
  const allPaths = options.paths || [];
  if (allPaths.length === 0) {
    console.log(gray("No paths provided. Use --paths to specify project directories."));
    process.exit(1);
  }

  const projects = discoverProjects(allPaths);

  if (projects.length === 0) {
    console.log(gray("No valid projects found in the provided paths."));
    process.exit(1);
  }

  // Show discovered projects
  console.log(gray("Found projects:"));
  for (const p of projects) {
    console.log(gray(`  ${p.name} (v${p.version || "unknown"})`));
  }
  console.log();

  // Ask what operation to perform
  const operationPrompt = new Select({
    name: "operation",
    message: "What would you like to do?",
    choices: [
      { name: "packages", message: "Update package dependencies" },
      { name: "bump", message: "Bump project versions" },
      { name: "both", message: "Update packages AND bump versions" },
    ],
  });
  const operation = await operationPrompt.run();

  let packageName = null;
  let version = null;
  let exact = false;
  let selectedPaths = allPaths;
  let bumpVersion = null;
  let preid = null;
  let commit = false;
  let push = false;

  // If updating packages
  if (operation === "packages" || operation === "both") {
    // Get package name
    const namePrompt = new Input({
      name: "packageName",
      message: "Package name to update:",
      validate: (value) => value.length > 0 || "Package name is required",
    });
    packageName = await namePrompt.run();

    // Find current versions in projects
    const currentVersions = findCurrentVersions(projects, packageName);
    
    // Show current versions if found
    if (currentVersions.length > 0) {
      console.log();
      console.log(gray("Current versions found:"));
      const uniqueVersions = [...new Set(currentVersions.map(v => v.version))];
      for (const v of uniqueVersions) {
        const count = currentVersions.filter(cv => cv.version === v).length;
        console.log(gray(`  ${v} (${count} project${count > 1 ? "s" : ""})`));
      }
      
      // Suggest versions based on the most common current version
      const mostCommon = uniqueVersions[0];
      const suggestions = [
        { type: "patch", version: suggestNextVersion(mostCommon, "patch") },
        { type: "minor", version: suggestNextVersion(mostCommon, "minor") },
        { type: "major", version: suggestNextVersion(mostCommon, "major") },
        { type: "prerelease", version: suggestNextVersion(mostCommon, "prerelease", "rc") },
      ].filter(s => s.version);
      
      if (suggestions.length > 0) {
        console.log();
        console.log(gray("Version suggestions:"));
        suggestions.forEach(s => {
          console.log(gray(`  ${s.type}: ${s.version}`));
        });
      }
      console.log();
    }
    
    // Get target version
    const versionPrompt = new Input({
      name: "version",
      message: `Target version for ${cyan(packageName)}:`,
      validate: (value) => value.length > 0 || "Version is required",
    });
    version = await versionPrompt.run();
    
    // Show version change type
    if (currentVersions.length > 0) {
      const changeType = getVersionChangeType(currentVersions[0].version, version);
      console.log();
      console.log(`  ${getVersionLabel(changeType)}`);
      console.log();
    }

    // Let user select which projects to update
    const selectPrompt = new MultiSelect({
      name: "projects",
      message: "Select projects to update (space to toggle, enter to confirm):",
      choices: projects.map((p) => ({
        name: p.path,
        value: p.path,
        message: p.name,
        hint: gray(p.path),
        enabled: true,
      })),
    });
    selectedPaths = await selectPrompt.run();

    if (selectedPaths.length === 0) {
      console.log(gray("No projects selected. Exiting."));
      process.exit(0);
    }

    // Ask about exact version
    const exactPrompt = new Confirm({
      name: "exact",
      message: "Use exact version (no ^ prefix)?",
      initial: false,
    });
    exact = await exactPrompt.run();
  }

  // If bumping versions
  if (operation === "bump" || operation === "both") {
    // Select bump type
    const bumpPrompt = new Select({
      name: "bumpType",
      message: "Version bump type:",
      choices: [
        { name: "patch", message: "patch  (1.0.0 → 1.0.1)" },
        { name: "minor", message: "minor  (1.0.0 → 1.1.0)" },
        { name: "major", message: "major  (1.0.0 → 2.0.0)" },
        { name: "prerelease", message: "prerelease (1.0.0 → 1.0.1-rc.0)" },
      ],
    });
    bumpVersion = await bumpPrompt.run();

    // If prerelease, ask for preid
    if (bumpVersion === "prerelease") {
      const preidPrompt = new Input({
        name: "preid",
        message: "Prerelease identifier (e.g., rc, beta, alpha):",
        initial: "rc",
      });
      preid = await preidPrompt.run();
    }

    // If standalone bump, let user select projects
    if (operation === "bump") {
      const selectPrompt = new MultiSelect({
        name: "projects",
        message: "Select projects to bump (space to toggle, enter to confirm):",
        choices: projects.map((p) => ({
          name: p.path,
          value: p.path,
          message: `${p.name} (v${p.version || "unknown"})`,
          hint: gray(p.path),
          enabled: true,
        })),
      });
      selectedPaths = await selectPrompt.run();

      if (selectedPaths.length === 0) {
        console.log(gray("No projects selected. Exiting."));
        process.exit(0);
      }
    }

    // Show preview
    console.log();
    console.log(gray("Version bump preview:"));
    for (const projectPath of selectedPaths) {
      const project = projects.find(p => p.path === projectPath);
      if (project && project.version) {
        const newVersion = suggestNextVersion(project.version, bumpVersion, preid || "0");
        console.log(gray(`  ${project.name}: ${project.version} → ${newVersion}`));
      }
    }
    console.log();
  }

  // Git options (if updating packages)
  if (operation === "packages" || operation === "both") {
    const commitPrompt = new Confirm({
      name: "commit",
      message: "Commit dependency changes?",
      initial: true,
    });
    commit = await commitPrompt.run();
  }

  // Push option
  const pushPrompt = new Confirm({
    name: "push",
    message: "Push to remote after changes?",
    initial: false,
  });
  push = await pushPrompt.run();

  // Build result object
  const result = {
    paths: selectedPaths,
    exact,
    commit,
    push,
  };

  if (packageName) {
    result.packageName = packageName;
    result.version = version;
  }

  if (bumpVersion) {
    result.bumpVersion = bumpVersion;
    if (preid) {
      result.preid = preid;
    }
  }

  // For standalone bump mode, we need to signal this
  if (operation === "bump") {
    result.standaloneBump = true;
  }

  return result;
}
