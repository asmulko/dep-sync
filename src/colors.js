/**
 * ANSI color codes for terminal output.
 * No external dependencies - uses built-in escape codes.
 */

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",

  // Foreground colors
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

export function green(text) {
  return `${colors.green}${text}${colors.reset}`;
}

export function yellow(text) {
  return `${colors.yellow}${text}${colors.reset}`;
}

export function red(text) {
  return `${colors.red}${text}${colors.reset}`;
}

export function cyan(text) {
  return `${colors.cyan}${text}${colors.reset}`;
}

export function gray(text) {
  return `${colors.gray}${text}${colors.reset}`;
}

export function bold(text) {
  return `${colors.bold}${text}${colors.reset}`;
}

export function dim(text) {
  return `${colors.dim}${text}${colors.reset}`;
}
