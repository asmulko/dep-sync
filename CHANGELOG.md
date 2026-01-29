# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-01-29

### Added
- JSON config file support (`.json`) - recommended for simplicity
- CommonJS config file support (`.cjs`) - for projects without ES modules
- ES Module config file support (`.mjs`) - always treated as ES module
- Auto-detection for `.js` files - tries ES module first, falls back to CommonJS

### Changed
- Updated README to recommend JSON config format
- Added example `dep-sync.config.json` in project root

## [1.1.0] - 2026-01-29

### Added
- `--bump-version <type>` option to bump project versions after updating dependencies
  - Supports `patch`, `minor`, `major`, and `prerelease` types
  - Prerelease creates versions like `1.0.1-rc.0`
  - Only bumps versions for projects that had dependency updates
  - Creates a separate commit for version bumps when used with `--commit`

### Changed
- Default commit message format now uses "Update X to Y" instead of "chore: update X to Y"

### Fixed
- Removed unused imports (`red`, `parseVersion`, `Select`) to clean up codebase

## [1.0.1] - 2026-01-29

### Added
- `--push` option to push all repositories to remote after committing
  - Automatically skips repos that are behind remote (need manual pull)
  - Shows push progress and summary
  - Works with `--dry-run` to preview push operations

## [1.0.0] - 2026-01-29

### Added
- Initial release of dep-sync CLI tool
- Core dependency update functionality across multiple projects
- Support for all dependency types: `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`

#### CLI Options
- `--pkg <name@version>` - Update multiple packages (repeatable flag)
- `--paths <paths...>` - Specify project directories to update
- `--exact` - Use exact versions without `^` or `~` prefix
- `--no-peer` - Skip peerDependencies updates
- `--dry-run` - Preview changes without modifying files

#### Git Integration
- `--commit` - Commit changes after updating (separate commit per package by default)
- `--single-commit` - Combine all package updates into one commit
- `--message <msg>` - Custom commit message
- `--branch <name>` - Create a new branch before committing
- `--no-sync` - Skip git fetch/pull before updating (sync is ON by default)

#### Configuration
- `--config <path>` - Load options from a JavaScript config file
- Support for single package or multiple packages in config
- Config merges with CLI options (CLI takes precedence)

#### Interactive Mode
- `--interactive` / `-i` - Run in interactive mode with prompts
- Project discovery and selection
- Version suggestions (patch, minor, major, prerelease)
- Confirmation before applying changes

#### Other Features
- Colored terminal output with status icons
- peerDependencies always use caret (`^`) to preserve range semantics
- Input validation for package names and versions
- Security: Shell argument escaping for git commands
- Scoped package support (`@scope/package@version`)

[1.1.0]: https://github.com/asmulko/dep-sync/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/asmulko/dep-sync/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/asmulko/dep-sync/releases/tag/v1.0.0
