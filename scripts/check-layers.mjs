import { readdirSync, readFileSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCOPE = '@yxl-vscode/';
const BUILTINS = new Set(builtinModules);

// Statements are semicolon-terminated (the formatter guarantees it), so `[^;]`
// safely spans the line breaks a wrapped import list introduces.
const FROM = /(?:^|[\n;])\s*(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g;
const BARE = /(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]/g;
const DYNAMIC = /\bimport\s*\(\s*['"]([^'"]+)['"]/g;

/**
 * @typedef {{ order: string[], hosts: Record<string, string> }} Layers
 * @typedef {{ files: Map<string, string>, dependencies: string[] }} Package
 * @typedef {{ where: string, specifier: string, reason: string }} Violation
 */

/**
 * Every violation of the order `layers.json` declares.
 *
 * Two passes see two different things. The declared dependencies are exact but
 * coarse; the sources catch what a manifest cannot say — a host reached from a
 * package that has no business reaching it.
 *
 * @param {Map<string, Package>} packages
 * @param {Layers} layers
 * @returns {Violation[]}
 */
export function findViolations(packages, layers) {
  const rank = new Map(layers.order.map((name, index) => [name, index]));
  const violations = [];

  for (const [name, pkg] of packages) {
    const own = rank.get(name);
    if (own === undefined) {
      violations.push({
        where: `packages/${name}`,
        specifier: '',
        reason: 'package is not listed in layers.json',
      });
      continue;
    }

    for (const dependency of pkg.dependencies) {
      const reason = reasonFor(dependency, name, own, rank, layers.hosts);
      if (reason) {
        violations.push({ where: `packages/${name}/package.json`, specifier: dependency, reason });
      }
    }

    for (const [file, text] of pkg.files) {
      for (const specifier of importsOf(text)) {
        const reason = reasonFor(specifier, name, own, rank, layers.hosts);
        if (reason) violations.push({ where: file, specifier, reason });
      }
    }
  }

  return violations;
}

/**
 * @param {string} specifier
 * @param {string} importer
 * @param {number} own
 * @param {Map<string, number>} rank
 * @param {Record<string, string>} hosts
 * @returns {string | null}
 */
function reasonFor(specifier, importer, own, rank, hosts) {
  const host = hostOf(specifier);
  if (host) {
    const allowed = hosts[host];
    return allowed && allowed !== importer
      ? `only \`${allowed}\` may reach the ${host} host (ADR-004)`
      : null;
  }

  if (!specifier.startsWith(SCOPE)) return null;

  const target = specifier.slice(SCOPE.length).split('/')[0];
  const targetRank = rank.get(target);
  if (targetRank === undefined) return `\`${target}\` is not listed in layers.json`;
  if (target === importer || targetRank < own) return null;

  return `imports upward: \`${importer}\` may not depend on \`${target}\``;
}

/**
 * The host a specifier reaches for, or null for an ordinary module.
 *
 * @param {string} specifier
 * @returns {string | null}
 */
function hostOf(specifier) {
  if (specifier === 'vscode') return 'vscode';
  if (specifier.startsWith('node:') || BUILTINS.has(specifier)) return 'node';
  return null;
}

/**
 * Module specifiers imported by one source file.
 *
 * A specifier inside a comment still counts. That is the cheap reading, and a
 * commented-out import is something to delete rather than to tolerate.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function importsOf(text) {
  const found = [];
  for (const pattern of [FROM, BARE, DYNAMIC]) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function sourceFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (/\.tsx?$/.test(entry)) found.push(path);
  }
  return found;
}

/**
 * @param {string} root
 * @param {Layers} layers
 * @returns {Map<string, Package>}
 */
function readWorkspace(root, layers) {
  const packages = new Map();

  for (const name of readdirSync(join(root, 'packages'))) {
    const dir = join(root, 'packages', name);
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const files = new Map();
    for (const file of sourceFiles(join(dir, 'src'))) {
      files.set(file.slice(root.length + 1), readFileSync(file, 'utf8'));
    }
    packages.set(name, { files, dependencies: Object.keys(manifest.dependencies ?? {}) });
  }

  for (const declared of layers.order) {
    if (!packages.has(declared)) {
      throw new Error(`layers.json lists \`${declared}\`, but packages/${declared} does not exist`);
    }
  }

  return packages;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const layers = JSON.parse(readFileSync(join(root, 'layers.json'), 'utf8'));
  const violations = findViolations(readWorkspace(root, layers), layers);

  for (const { where, specifier, reason } of violations) {
    process.stderr.write(`${where}: ${specifier ? `'${specifier}' — ` : ''}${reason}\n`);
  }
  if (violations.length > 0) {
    process.stderr.write(`\n${violations.length} layer violation(s); see layers.json\n`);
    process.exit(1);
  }
  process.stdout.write(`layers ok (${layers.order.length} packages)\n`);
}
