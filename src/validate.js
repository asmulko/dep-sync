/**
 * Validate a semver-like version string.
 * Accepts versions like: 1.0.0, 18.2.0, 1.0.0-beta.1, etc.
 * @param {string} version - Version string to validate
 * @returns {boolean}
 */
export function isValidVersion(version) {
  // Basic semver pattern (major.minor.patch with optional prerelease/build)
  const semverPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
  return semverPattern.test(version);
}

/**
 * Validate a package name.
 * @param {string} name - Package name to validate
 * @returns {boolean}
 */
export function isValidPackageName(name) {
  if (!name || typeof name !== "string") {
    return false;
  }
  // Basic npm package name validation
  // - Must not be empty
  // - Must not start with . or _
  // - Must not contain spaces or special characters (except @ for scoped packages)
  const npmPattern = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
  return npmPattern.test(name);
}

/**
 * Sanitize a branch name for git.
 * @param {string} branch - Branch name
 * @returns {string} Sanitized branch name
 */
export function sanitizeBranchName(branch) {
  if (!branch || typeof branch !== "string") {
    return "";
  }
  // Remove or replace invalid characters
  return branch
    .replace(/[^a-zA-Z0-9/_.-]/g, "-") // Replace invalid chars with dash
    .replace(/\.{2,}/g, ".") // No consecutive dots
    .replace(/^[.-]/, "") // No leading dots or dashes
    .replace(/[.-]$/, "") // No trailing dots or dashes
    .replace(/\/{2,}/g, "/") // No consecutive slashes
    .substring(0, 100); // Limit length
}

/**
 * Validate all options before running.
 * @param {Object} options - Options to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateOptions(options) {
  const errors = [];

  if (!options.packageName) {
    errors.push("Package name is required");
  } else if (!isValidPackageName(options.packageName)) {
    errors.push(`Invalid package name: ${options.packageName}`);
  }

  if (!options.version) {
    errors.push("Version is required");
  } else if (!isValidVersion(options.version)) {
    errors.push(`Invalid version format: ${options.version}. Expected format: x.y.z`);
  }

  if (!options.paths || !Array.isArray(options.paths) || options.paths.length === 0) {
    errors.push("At least one path is required");
  }

  if (options.branch && sanitizeBranchName(options.branch) !== options.branch) {
    // Warn but don't fail - we'll sanitize it
    console.warn(`Warning: Branch name was sanitized from "${options.branch}" to "${sanitizeBranchName(options.branch)}"`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
