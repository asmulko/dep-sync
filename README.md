# dep-sync

Sync dependency versions across multiple projects. Perfect for monorepos and managing multiple React/Node.js applications.

## Installation

```bash
# Global install
npm install -g dep-sync

# Or use with npx
npx dep-sync react 18.2.0 --paths ./apps/*
```

## Usage

### Basic usage

```bash
dep-sync react 18.2.0 --paths ./apps/app1 --paths ./apps/app2
```

### With exact version (no ^ prefix)

```bash
dep-sync react 18.2.0 --paths ./apps/* --exact
```

### Dry-run mode (preview changes)

```bash
dep-sync react 18.2.0 --paths ./apps/* --dry-run
```

### Multiple packages

```bash
# Using --pkg flag (repeatable)
dep-sync --pkg react@18.2.0 --pkg react-dom@18.2.0 --paths ./apps/*
```

### Using a config file

```bash
dep-sync --config dep-sync.config.js
```

Example config file (single package):

```javascript
export default {
  packageName: "react",
  version: "18.2.0",
  paths: [
    "./apps/app1",
    "./apps/app2",
  ],
  exact: false,
};
```

Example config file (multiple packages):

```javascript
export default {
  packages: {
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "@types/react": "18.2.0",
  },
  paths: [
    "./apps/app1",
    "./apps/app2",
  ],
  exact: false,
};
```

### Interactive mode

```bash
dep-sync --interactive --paths ./apps/*
```

### Git integration

```bash
# Git sync (fetch + pull --rebase) runs by default
# Repos are synced automatically before updates

# Skip git sync
dep-sync react 18.2.0 --paths ./apps/* --no-sync

# Commit changes (separate commit per package by default)
dep-sync --pkg react@18.2.0 --pkg lodash@4.0.0 --paths ./apps/* --commit

# Single commit for all packages
dep-sync --pkg react@18.2.0 --pkg lodash@4.0.0 --paths ./apps/* --commit --single-commit

# Commit and push to remote
dep-sync react 18.2.0 --paths ./apps/* --commit --push

# Create branch, commit, and push
dep-sync react 18.2.0 --paths ./apps/* --commit --branch chore/react-18 --push

# Custom commit message
dep-sync react 18.2.0 --paths ./apps/* --commit --message "chore(deps): upgrade react"
```

## Options

| Option | Description |
|--------|-------------|
| `--pkg <name@version>` | Package to update (repeatable for multiple packages) |
| `--paths <paths...>` | Paths to project directories |
| `--exact` | Use exact version (no ^ or ~ prefix) |
| `--dry-run` | Preview changes without modifying files |
| `--no-peer` | Skip peerDependencies |
| `--no-sync` | Skip git fetch/pull before updating (sync is ON by default) |
| `--commit` | Commit changes after updating (separate commit per package) |
| `--single-commit` | Combine all package updates into one commit |
| `--push` | Push to remote after committing (skips repos that are behind) |
| `--message <msg>` | Custom commit message |
| `--branch <name>` | Create a new branch before committing |
| `--config <path>` | Path to config file |
| `--interactive, -i` | Run in interactive mode |
| `--help` | Show help message |

> **Note:** The package will be automatically updated in all dependency types where it exists
> (dependencies, devDependencies, peerDependencies, optionalDependencies).
> peerDependencies always use caret (^) to preserve range semantics.

## Example output

```
Updating react to ^18.2.0

✔ app1 (deps, devDeps)
  deps: ^18.1.0 → ^18.2.0
  devDeps: ^18.1.0 → ^18.2.0

✔ sdk-package (deps, peerDeps)
  deps: ^18.1.0 → ^18.2.0
  peerDeps: ^17.0.0 || ^18.0.0 → ^18.2.0 (range preserved)

⚠ legacy-app: react not found

Summary:
  ✔ Updated: 2
  ⚠ Not found: 1
```

## License

MIT
