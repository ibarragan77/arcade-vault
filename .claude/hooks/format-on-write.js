#!/usr/bin/env node
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const PRETTIER_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".css", ".scss", ".md", ".mdx", ".yml", ".yaml", ".html",
]);
const LINT_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORED_DIR_NAMES = new Set(["node_modules", ".next", ".git", "out", "build", "coverage"]);
const IGNORED_BASENAMES = new Set(["package-lock.json", "tsconfig.tsbuildinfo"]);

const PRETTIER_BIN = path.join(PROJECT_ROOT, "node_modules", "prettier", "bin", "prettier.cjs");
const ESLINT_BIN = path.join(PROJECT_ROOT, "node_modules", "eslint", "bin", "eslint.js");

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function resolveFilePath(payload) {
  return (
    payload?.tool_response?.filePath ||
    payload?.tool_input?.file_path ||
    null
  );
}

function shouldSkip(absPath) {
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return true;

  const relPath = path.relative(PROJECT_ROOT, absPath);
  if (relPath.startsWith("..") || path.isAbsolute(relPath)) return true;
  if (relPath.split(path.sep).some((segment) => IGNORED_DIR_NAMES.has(segment))) return true;

  const base = path.basename(absPath);
  if (IGNORED_BASENAMES.has(base) || base.startsWith(".env")) return true;

  return false;
}

function runNodeScript(scriptPath, args) {
  return execFileSync(process.execPath, [scriptPath, ...args], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readStdin());
  } catch {
    return;
  }

  const filePath = resolveFilePath(payload);
  if (!filePath) return;

  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(PROJECT_ROOT, filePath);
  if (shouldSkip(absPath)) return;

  const ext = path.extname(absPath).toLowerCase();
  const relPath = path.relative(PROJECT_ROOT, absPath);

  if (PRETTIER_EXTS.has(ext) && fs.existsSync(PRETTIER_BIN)) {
    try {
      runNodeScript(PRETTIER_BIN, ["--write", absPath]);
    } catch {
      // Formatting failures (e.g. syntax not yet valid mid-edit) are non-fatal.
    }
  }

  if (LINT_EXTS.has(ext) && fs.existsSync(ESLINT_BIN)) {
    try {
      runNodeScript(ESLINT_BIN, ["--fix", absPath]);
    } catch {
      // eslint --fix exits non-zero when unfixable errors remain; expected.
    }

    let lintOutput = "";
    try {
      lintOutput = runNodeScript(ESLINT_BIN, [absPath]).trim();
    } catch (err) {
      lintOutput = (err.stdout || "").toString().trim();
    }

    if (lintOutput) {
      process.stdout.write(
        JSON.stringify({
          decision: "block",
          reason: `ESLint found unresolved issues in ${relPath}:\n\n${lintOutput}\n\nFix these before continuing.`,
        })
      );
    }
  }
}

main();
