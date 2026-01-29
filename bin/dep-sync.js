#!/usr/bin/env node

import { parseArgs } from "node:util";
import path from "node:path";
import { bumpDependency, bumpVersions } from "../src/bump.js";
import { loadConfig, mergeOptions } from "../src/config.js";
import { interactiveMode } from "../src/interactive.js";
import { performGitOperations, prepareRepo, getGitRoot, isGitRepo, pushToRemote, isBehindRemote } from "../src/git.js";
import { validateOptions, sanitizeBranchName } from "../src/validate.js";
import { bold, red, yellow, gray, green, cyan } from "../src/colors.js";

const usage = `
Usage: dep-sync <package> <version> [options]
       dep-sync --pkg <name>@<version> [--pkg ...] --paths <paths...>
       dep-sync --config <path>
       dep-sync --interactive --paths <paths...>

Arguments:
  package              Name of the package to update (single package mode)
  version              Target version to set

Options:
  --pkg <name@version> Package to update (repeatable for multiple packages)
  --config <path>      Path to config file (e.g., dep-sync.config.js)
  --paths <paths...>   Paths to project directories
  --exact              Use exact version (no ^ or ~ prefix)
  --no-peer            Skip peerDependencies (they require special care)
  --dry-run            Preview changes without modifying files
  --no-sync            Skip git fetch/pull before updating (sync is ON by default)
  --commit             Commit changes after updating (separate commit per package)
  --single-commit      Combine all package updates into one commit
  --push               Push to remote after committing (skips repos that are behind)
  --message <msg>      Custom commit message (default: "Update <pkg> to <version>")
  --branch <name>      Create a new branch before committing
  --bump-version <type> Bump version in each project's package.json (patch|minor|major|prerelease)
  --interactive, -i    Run in interactive mode
  --help               Show this help message

Note: The package will be updated in all dependency types where it exists.
      peerDependencies always use caret (^) to preserve range semantics.

Examples:
  # Single package
  dep-sync react 18.2.0 --paths ./apps/app1 ./apps/app2 --exact

  # Multiple packages
  dep-sync --pkg react@18.2.0 --pkg react-dom@18.2.0 --paths ./apps/*

  # Commit with separate commits per package (default)
  dep-sync --pkg react@18.2.0 --pkg lodash@4.0.0 --paths ./apps/* --commit

  # Combine all updates into single commit
  dep-sync --pkg react@18.2.0 --pkg lodash@4.0.0 --paths ./apps/* --commit --single-commit

  # Skip git sync (fetch/pull)
  dep-sync react 18.2.0 --paths ./apps/* --no-sync --commit

  # Bump project versions after updating dependencies
  dep-sync --pkg react@18.2.0 --paths ./apps/* --commit --bump-version patch

  # Using config file
  dep-sync --config dep-sync.config.js

  # Interactive mode
  dep-sync --interactive --paths ./apps/*
`;

/**
 * Parse a package@version string.
 * @param {string} pkgString - e.g., "react@18.2.0" or "@scope/pkg@1.0.0"
 * @returns {{ name: string, version: string }}
 */
function parsePackageSpec(pkgString) {
  // Handle scoped packages like @scope/pkg@1.0.0
  const lastAtIndex = pkgString.lastIndexOf("@");
  if (lastAtIndex <= 0) {
    throw new Error(`Invalid package format: ${pkgString}. Expected name@version`);
  }
  return {
    name: pkgString.slice(0, lastAtIndex),
    version: pkgString.slice(lastAtIndex + 1),
  };
}

function printUsage() {
  console.log(usage);
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    printUsage();
  }

  const { values, positionals } = parseArgs({
    args,
    options: {
      config: { type: "string" },
      pkg: { type: "string", multiple: true },
      paths: { type: "string", multiple: true },
      exact: { type: "boolean", default: false },
      "no-peer": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      "no-sync": { type: "boolean", default: false },
      commit: { type: "boolean", default: false },
      "single-commit": { type: "boolean", default: false },
      push: { type: "boolean", default: false },
      message: { type: "string" },
      branch: { type: "string" },
      "bump-version": { type: "string" },
      interactive: { type: "boolean", short: "i", default: false },
    },
    allowPositionals: true,
  });

  // Determine packages to update
  let packages = []; // Array of { name, version }
  let baseOptions = {
    paths: values.paths || [],
    exact: values.exact,
    noPeer: values["no-peer"],
    dryRun: values["dry-run"],
    sync: !values["no-sync"], // sync is ON by default
    commit: values.commit,
    singleCommit: values["single-commit"],
    push: values.push,
    message: values.message,
    branch: values.branch,
    bumpVersion: values["bump-version"],
  };

  if (values.interactive) {
    // Interactive mode - prompts for all input, ignores positionals
    const interactiveResult = await interactiveMode(baseOptions);
    packages = [{ name: interactiveResult.packageName, version: interactiveResult.version }];
    baseOptions = { ...baseOptions, ...interactiveResult };
  } else if (values.config) {
    // Load from config file
    const configOptions = await loadConfig(values.config);
    
    // Check if config has multiple packages
    if (configOptions.packages && typeof configOptions.packages === "object") {
      packages = Object.entries(configOptions.packages).map(([name, version]) => ({ name, version }));
    } else if (configOptions.packageName && configOptions.version) {
      packages = [{ name: configOptions.packageName, version: configOptions.version }];
    }
    
    baseOptions = mergeOptions(baseOptions, configOptions);
  } else if (values.pkg && values.pkg.length > 0) {
    // Multi-package mode via --pkg flags
    packages = values.pkg.map(parsePackageSpec);
  } else {
    // Single package mode (positional args)
    if (positionals.length < 2) {
      console.error("Error: package name and version are required.\n");
      printUsage();
    }

    const [packageName, version] = positionals;
    packages = [{ name: packageName, version }];
  }

  // Validate paths
  if (!baseOptions.paths || baseOptions.paths.length === 0) {
    console.error("Error: at least one --paths value is required.\n");
    printUsage();
  }

  // Deduplicate paths
  baseOptions.paths = [...new Set(baseOptions.paths)];

  if (packages.length === 0) {
    console.error("Error: at least one package is required.\n");
    printUsage();
  }

  // Warn if --single-commit without --commit
  if (baseOptions.singleCommit && !baseOptions.commit) {
    console.log(`${yellow("⚠")} --single-commit has no effect without --commit`);
  }

  // Sanitize branch name if provided
  if (baseOptions.branch) {
    baseOptions.branch = sanitizeBranchName(baseOptions.branch);
  }

  // Validate --bump-version option
  const validBumpTypes = ["patch", "minor", "major", "prerelease"];
  if (baseOptions.bumpVersion && !validBumpTypes.includes(baseOptions.bumpVersion)) {
    console.error(`${red("✖")} Invalid --bump-version value: ${baseOptions.bumpVersion}`);
    console.error(`   Valid values: ${validBumpTypes.join(", ")}`);
    process.exit(1);
  }

  // Git sync: fetch and pull --rebase before updating
  if (baseOptions.sync) {
    console.log(bold("\nSyncing repositories:"));
    const seenRoots = new Set();
    
    for (const projectPath of baseOptions.paths) {
      if (!isGitRepo(projectPath)) continue;
      
      const gitRoot = getGitRoot(projectPath);
      if (seenRoots.has(gitRoot)) continue;
      seenRoots.add(gitRoot);

      const result = prepareRepo(projectPath, baseOptions.dryRun);
      if (!result.success && result.error) {
        console.error(`\n${red("✖")} ${result.error}`);
        console.error(`${yellow("⚠")} Please commit or stash your changes before using --sync.`);
        process.exit(1);
      }
    }
    console.log();
  }

  // Process each package
  let allUpdatedFiles = [];
  let branchCreated = false;
  let hadErrors = false;

  for (const pkg of packages) {
    const options = {
      packageName: pkg.name,
      version: pkg.version,
      paths: baseOptions.paths,
      exact: baseOptions.exact,
      noPeer: baseOptions.noPeer,
      dryRun: baseOptions.dryRun,
    };

    // Validate options
    const validation = validateOptions(options);
    if (!validation.valid) {
      console.error(`${red("✖")} Validation errors for ${pkg.name}@${pkg.version}:`);
      validation.errors.forEach((err) => console.error(`  - ${err}`));
      hadErrors = true;
      continue;
    }

    const results = bumpDependency(options);
    
    if (results.updated.length > 0) {
      const updatedFilePaths = results.updated.map((r) => r.filePath);
      allUpdatedFiles.push(...updatedFilePaths);

      // Per-package commit (unless --single-commit)
      if (baseOptions.commit && !baseOptions.singleCommit) {
        performGitOperations({
          updatedFiles: updatedFilePaths,
          packageName: pkg.name,
          version: pkg.version,
          shouldCommit: true,
          branch: !branchCreated ? baseOptions.branch : undefined, // Only create branch once
          commitMessage: baseOptions.message,
          dryRun: baseOptions.dryRun,
        });
        branchCreated = true;
      }
    }
  }

  // Single commit mode: commit all packages together
  if (baseOptions.singleCommit && (baseOptions.commit || baseOptions.branch) && allUpdatedFiles.length > 0) {
    const uniqueFiles = [...new Set(allUpdatedFiles)];
    const pkgSummary = packages.length === 1 
      ? `${packages[0].name} to ${packages[0].version}`
      : `${packages.length} packages`;
    
    performGitOperations({
      updatedFiles: uniqueFiles,
      packageName: pkgSummary,
      version: "",
      shouldCommit: baseOptions.commit,
      branch: baseOptions.branch,
      commitMessage: baseOptions.message,
      dryRun: baseOptions.dryRun,
    });
  }

  // Handle branch-only mode (no commit, but branch was requested)
  if (baseOptions.branch && !baseOptions.commit && allUpdatedFiles.length > 0) {
    const uniqueFiles = [...new Set(allUpdatedFiles)];
    performGitOperations({
      updatedFiles: uniqueFiles,
      packageName: "",
      version: "",
      shouldCommit: false,
      branch: baseOptions.branch,
      dryRun: baseOptions.dryRun,
    });
  }

  // Bump project versions if requested
  if (baseOptions.bumpVersion && allUpdatedFiles.length > 0) {
    // Only bump versions for projects that had dependency updates
    const updatedProjectPaths = [...new Set(
      allUpdatedFiles.map((f) => path.dirname(f))
    )];
    
    const versionResults = bumpVersions({
      paths: updatedProjectPaths,
      bumpType: baseOptions.bumpVersion,
      dryRun: baseOptions.dryRun,
    });

    // Commit version bumps if --commit is enabled
    if (baseOptions.commit && versionResults.updated.length > 0) {
      const versionFiles = versionResults.updated.map((r) => r.filePath);
      
      performGitOperations({
        updatedFiles: versionFiles,
        packageName: "version bump",
        version: baseOptions.bumpVersion,
        shouldCommit: true,
        commitMessage: baseOptions.message || `Bump versions (${baseOptions.bumpVersion})`,
        dryRun: baseOptions.dryRun,
      });
      
      // Add version files to allUpdatedFiles for push
      allUpdatedFiles.push(...versionFiles);
    }

    if (versionResults.errors.length > 0) {
      hadErrors = true;
    }
  }

  // Push to remote if requested
  if (baseOptions.push && allUpdatedFiles.length > 0) {
    console.log();
    console.log(bold("Pushing to remote:"));
    
    // Get unique git roots from updated files
    const seenRoots = new Set();
    const pushResults = { success: [], failed: [], skipped: [] };
    
    for (const filePath of allUpdatedFiles) {
      const dir = path.dirname(filePath);
      if (!isGitRepo(dir)) continue;
      
      const gitRoot = getGitRoot(dir);
      if (seenRoots.has(gitRoot)) continue;
      seenRoots.add(gitRoot);
      
      const repoName = path.basename(gitRoot);
      
      if (baseOptions.dryRun) {
        console.log(`  ${gray("Would push:")} ${repoName}`);
        pushResults.success.push(repoName);
        continue;
      }
      
      // Check if behind remote
      if (isBehindRemote(gitRoot)) {
        console.log(`  ${yellow("⚠")} ${repoName}: ${yellow("behind remote - please pull manually")}`);
        pushResults.skipped.push(repoName);
        continue;
      }
      
      // Try to push
      process.stdout.write(`  ${cyan("⟳")} Pushing ${bold(repoName)}...`);
      const result = pushToRemote(gitRoot);
      
      if (result.success) {
        process.stdout.write(`\r  ${green("✔")} Pushed ${bold(repoName)}     \n`);
        pushResults.success.push(repoName);
      } else {
        process.stdout.write(`\r  ${red("✖")} ${repoName}: ${red("push failed")}     \n`);
        console.log(`      ${gray(result.error)}`);
        pushResults.failed.push(repoName);
      }
    }
    
    // Push summary
    if (pushResults.skipped.length > 0 || pushResults.failed.length > 0) {
      console.log();
      if (pushResults.skipped.length > 0) {
        console.log(`${yellow("⚠")} ${pushResults.skipped.length} repo(s) skipped - need manual pull first`);
      }
      if (pushResults.failed.length > 0) {
        console.log(`${red("✖")} ${pushResults.failed.length} repo(s) failed to push`);
        hadErrors = true;
      }
    }
  }

  // Exit with error code if any validation failed
  if (hadErrors) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
