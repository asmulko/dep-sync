/**
 * Version utilities for smart version suggestions.
 */

/**
 * Parse a semver version string.
 * Supports formats like: 1.2.3, 1.2.3-rc.0, 1.2.3-beta.1, v1.2.3
 * @param {string} version - Version string
 * @returns {{ major: number, minor: number, patch: number, prerelease?: string, prereleaseNum?: number } | null}
 */
export function parseVersion(version) {
  // Strip leading 'v' or '^' or '~'
  const clean = version.replace(/^[v^~]/, "");
  
  // Match semver: major.minor.patch[-prerelease.num]
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z]+)(?:[.-](\d+))?)?$/);
  
  if (!match) return null;
  
  const [, major, minor, patch, prerelease, prereleaseNum] = match;
  
  return {
    major: parseInt(major, 10),
    minor: parseInt(minor, 10),
    patch: parseInt(patch, 10),
    prerelease: prerelease || undefined,
    prereleaseNum: prereleaseNum !== undefined ? parseInt(prereleaseNum, 10) : undefined,
  };
}

/**
 * Format a parsed version back to string.
 * @param {{ major: number, minor: number, patch: number, prerelease?: string, prereleaseNum?: number }} parsed
 * @returns {string}
 */
export function formatVersion(parsed) {
  let v = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  if (parsed.prerelease) {
    v += `-${parsed.prerelease}`;
    if (parsed.prereleaseNum !== undefined) {
      v += `.${parsed.prereleaseNum}`;
    }
  }
  return v;
}

/**
 * Determine the type of version change.
 * @param {string} oldVersion - Current version
 * @param {string} newVersion - Target version
 * @returns {'major' | 'minor' | 'patch' | 'prerelease' | 'unknown'}
 */
export function getVersionChangeType(oldVersion, newVersion) {
  const oldParsed = parseVersion(oldVersion);
  const newParsed = parseVersion(newVersion);
  
  if (!oldParsed || !newParsed) return "unknown";
  
  // Check for prerelease
  if (newParsed.prerelease) {
    return "prerelease";
  }
  
  // Check major change
  if (newParsed.major > oldParsed.major) {
    return "major";
  }
  
  // Check minor change
  if (newParsed.major === oldParsed.major && newParsed.minor > oldParsed.minor) {
    return "minor";
  }
  
  // Check patch change
  if (newParsed.major === oldParsed.major && 
      newParsed.minor === oldParsed.minor && 
      newParsed.patch > oldParsed.patch) {
    return "patch";
  }
  
  // Downgrade or prerelease to stable
  if (oldParsed.prerelease && !newParsed.prerelease) {
    return "patch"; // Prerelease to stable is like a patch
  }
  
  return "unknown";
}

/**
 * Suggest next version based on type.
 * @param {string} currentVersion - Current version
 * @param {'major' | 'minor' | 'patch' | 'prerelease'} type - Type of bump
 * @param {string} [prereleaseTag='rc'] - Prerelease tag (e.g., 'rc', 'beta', 'alpha')
 * @returns {string | null}
 */
export function suggestNextVersion(currentVersion, type, prereleaseTag = "rc") {
  const parsed = parseVersion(currentVersion);
  if (!parsed) return null;
  
  switch (type) {
    case "major":
      return `${parsed.major + 1}.0.0`;
    
    case "minor":
      return `${parsed.major}.${parsed.minor + 1}.0`;
    
    case "patch":
      // If current is prerelease, just drop the prerelease
      if (parsed.prerelease) {
        return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
      }
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
    
    case "prerelease":
      // If already a prerelease of same tag, increment
      if (parsed.prerelease === prereleaseTag && parsed.prereleaseNum !== undefined) {
        return `${parsed.major}.${parsed.minor}.${parsed.patch}-${prereleaseTag}.${parsed.prereleaseNum + 1}`;
      }
      // Otherwise start a new prerelease for next patch
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}-${prereleaseTag}.0`;
    
    default:
      return null;
  }
}

/**
 * Get a human-readable label for version change type.
 * @param {'major' | 'minor' | 'patch' | 'prerelease' | 'unknown'} type
 * @returns {string}
 */
export function getVersionLabel(type) {
  const labels = {
    major: "⚠️  MAJOR (breaking changes possible)",
    minor: "✨ Minor (new features)",
    patch: "🔧 Patch (bug fixes)",
    prerelease: "🚧 Prerelease (unstable)",
    unknown: "❓ Unknown",
  };
  return labels[type] || labels.unknown;
}

/**
 * Compare two versions.
 * @param {string} a - First version
 * @param {string} b - Second version
 * @returns {-1 | 0 | 1} -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  
  if (!pa || !pb) return 0;
  
  // Compare major.minor.patch
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  
  // Prerelease versions are less than release
  if (pa.prerelease && !pb.prerelease) return -1;
  if (!pa.prerelease && pb.prerelease) return 1;
  
  // Compare prerelease numbers
  if (pa.prerelease && pb.prerelease) {
    if (pa.prerelease !== pb.prerelease) {
      return pa.prerelease < pb.prerelease ? -1 : 1;
    }
    if (pa.prereleaseNum !== pb.prereleaseNum) {
      return (pa.prereleaseNum || 0) < (pb.prereleaseNum || 0) ? -1 : 1;
    }
  }
  
  return 0;
}
