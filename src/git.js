import { execSync } from "node:child_process";
import path from "node:path";
import { green, yellow, gray, bold, red, cyan } from "./colors.js";

/**
 * Escape a string for safe use in shell commands.
 * @param {string} str - String to escape
 * @returns {string}
 */
function escapeShellArg(str) {
  // Replace backslashes first, then double quotes
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Execute a git command in a directory.
 * @param {string} command - Git command to run
 * @param {string} cwd - Working directory
 * @returns {string} Command output
 */
function git(command, cwd) {
  return execSync(`git ${command}`, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

/**
 * Check if a directory is a git repository.
 * @param {string} dir - Directory to check
 * @returns {boolean}
 */
export function isGitRepo(dir) {
  try {
    git("rev-parse --git-dir", dir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the root of the git repository.
 * @param {string} dir - Directory inside the repo
 * @returns {string} Absolute path to git root
 */
export function getGitRoot(dir) {
  return git("rev-parse --show-toplevel", dir);
}

/**
 * Check if there are uncommitted changes.
 * @param {string} dir - Directory to check
 * @returns {boolean}
 */
export function hasUncommittedChanges(dir) {
  const status = git("status --porcelain", dir);
  return status.length > 0;
}

/**
 * Fetch from remote.
 * @param {string} cwd - Working directory
 */
export function fetchRemote(cwd) {
  git("fetch", cwd);
}

/**
 * Pull with rebase.
 * @param {string} cwd - Working directory
 */
export function pullRebase(cwd) {
  git("pull --rebase", cwd);
}

/**
 * Get current branch name.
 * @param {string} cwd - Working directory
 * @returns {string}
 */
export function getCurrentBranch(cwd) {
  return git("rev-parse --abbrev-ref HEAD", cwd);
}

/**
 * Check if branch has an upstream.
 * @param {string} cwd - Working directory
 * @returns {boolean}
 */
export function hasUpstream(cwd) {
  try {
    git("rev-parse --abbrev-ref @{upstream}", cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if local branch is behind remote.
 * @param {string} cwd - Working directory
 * @returns {boolean}
 */
export function isBehindRemote(cwd) {
  try {
    git("fetch", cwd);
    const behind = git("rev-list --count HEAD..@{upstream}", cwd);
    return parseInt(behind, 10) > 0;
  } catch {
    return false;
  }
}

/**
 * Push to remote.
 * @param {string} cwd - Working directory
 * @param {string} [branch] - Branch name (optional, uses current branch)
 * @returns {{ success: boolean, error?: string }}
 */
export function pushToRemote(cwd, branch) {
  try {
    const currentBranch = branch || getCurrentBranch(cwd);
    
    // Check if we have an upstream
    if (!hasUpstream(cwd)) {
      git(`push --set-upstream origin "${escapeShellArg(currentBranch)}"`, cwd);
    } else {
      git("push", cwd);
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Prepare git repo before updates: fetch and pull --rebase.
 * Stops if there are uncommitted changes.
 * @param {string} dir - Directory inside the repo
 * @param {boolean} dryRun - If true, only report what would happen
 * @returns {{ success: boolean, error?: string }}
 */
export function prepareRepo(dir, dryRun = false) {
  if (!isGitRepo(dir)) {
    return { success: true, skipped: true, reason: "Not a git repository" };
  }

  const gitRoot = getGitRoot(dir);
  const repoName = path.basename(gitRoot);

  // Check for uncommitted changes
  if (hasUncommittedChanges(gitRoot)) {
    return {
      success: false,
      error: `${repoName} has uncommitted changes. Please commit or stash them first.`,
    };
  }

  if (dryRun) {
    console.log(`  ${gray("Would fetch and pull:")} ${repoName}`);
    return { success: true, dryRun: true };
  }

  try {
    // Fetch
    process.stdout.write(`  ${cyan("⟳")} Fetching ${bold(repoName)}...`);
    fetchRemote(gitRoot);
    process.stdout.write(`\r  ${green("✔")} Fetched ${bold(repoName)}    \n`);

    // Pull with rebase only if there's an upstream
    if (hasUpstream(gitRoot)) {
      process.stdout.write(`  ${cyan("⟳")} Pulling ${bold(repoName)}...`);
      pullRebase(gitRoot);
      process.stdout.write(`\r  ${green("✔")} Pulled ${bold(repoName)}     \n`);
    }

    return { success: true };
  } catch (err) {
    console.log(`\n  ${red("✖")} Failed to sync ${repoName}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Create a new branch.
 * @param {string} branchName - Name of the branch
 * @param {string} cwd - Working directory
 */
export function createBranch(branchName, cwd) {
  // Branch name should already be sanitized, but escape just in case
  git(`checkout -b "${escapeShellArg(branchName)}"`, cwd);
}

/**
 * Stage files for commit.
 * @param {string[]} files - Files to stage
 * @param {string} cwd - Working directory
 */
export function stageFiles(files, cwd) {
  for (const file of files) {
    git(`add "${escapeShellArg(file)}"`, cwd);
  }
}

/**
 * Commit staged changes.
 * @param {string} message - Commit message
 * @param {string} cwd - Working directory
 */
export function commit(message, cwd) {
  git(`commit -m "${escapeShellArg(message)}"`, cwd);
}

/**
 * Generate default commit message for dependency updates.
 * @param {string|string[]} packageNames - Package name(s)
 * @param {string} version - Version (optional, only used for single package)
 * @returns {string}
 */
export function defaultCommitMessage(packageNames, version) {
  // Handle array of package names
  if (Array.isArray(packageNames)) {
    if (packageNames.length === 1) {
      return `Update ${packageNames[0]} dependency`;
    }
    return `Update ${packageNames.join(", ")} dependencies`;
  }
  
  // Single package with version
  if (version) {
    return `Update ${packageNames} dependency`;
  }
  return `Update ${packageNames} dependencies`;
}

/**
 * Perform git operations after updating dependencies.
 * @param {Object} options
 * @param {string[]} options.updatedFiles - Paths to updated package.json files
 * @param {string} options.packageName - Name of the package that was updated
 * @param {string} options.version - Version that was set
 * @param {boolean} options.shouldCommit - Whether to commit changes
 * @param {string} options.branch - Branch name to create (optional)
 * @param {string} options.commitMessage - Custom commit message (optional)
 * @param {boolean} options.dryRun - If true, only report what would happen
 * @returns {Object} Git operation results
 */
export function performGitOperations(options) {
  const { updatedFiles, packageName, version, shouldCommit, branch, commitMessage, dryRun } = options;

  if (updatedFiles.length === 0) {
    return { success: false, reason: "No files to commit" };
  }

  // Find git root from the first updated file
  const firstFile = updatedFiles[0];
  const fileDir = path.dirname(firstFile);

  if (!isGitRepo(fileDir)) {
    console.log(`${yellow("⚠")} ${gray("Not a git repository, skipping git operations")}`);
    return { success: false, reason: "Not a git repository" };
  }

  const gitRoot = getGitRoot(fileDir);
  const message = commitMessage || defaultCommitMessage(packageName, version);

  console.log();
  console.log(bold("Git Operations:"));

  if (dryRun) {
    if (branch) {
      console.log(`  ${gray("Would create branch:")} ${cyan(branch)}`);
    }
    console.log(`  ${gray("Would stage:")} ${updatedFiles.length} file(s)`);
    console.log(`  ${gray("Would commit:")} ${message}`);
    return { success: true, dryRun: true };
  }

  try {
    // Create branch if specified
    if (branch) {
      console.log(`  ${green("✔")} Creating branch: ${bold(branch)}`);
      createBranch(branch, gitRoot);
    }

    // Stage files
    const relativeFiles = updatedFiles.map((f) => path.relative(gitRoot, f));
    stageFiles(relativeFiles, gitRoot);
    console.log(`  ${green("✔")} Staged ${updatedFiles.length} file(s)`);

    // Commit if requested
    if (shouldCommit) {
      commit(message, gitRoot);
      console.log(`  ${green("✔")} Committed: ${gray(message)}`);
    }

    return { success: true };
  } catch (err) {
    console.log(`  ${red("✖")} Git operation failed: ${err.message}`);
    return { success: false, reason: err.message };
  }
}
