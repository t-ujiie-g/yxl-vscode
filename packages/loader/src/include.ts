import { type Node, type Path, parse } from '@yxl-vscode/cst';
import { INCLUDE_KEY } from '@yxl-vscode/spec';
import { filePath } from '@yxl-vscode/units';
import { CODE } from './codes';
import { type Ctx, keyOf, reject, type Site } from './ctx';

/**
 * Where a node really is, following an `$include` that stands in its place —
 * the included file's root, with a path that starts again there. `null` with
 * the reason reported where it could not be followed; a loop is named.
 */
export function follow(ctx: Ctx, node: Node, path: Path): Site | null {
  const written = includePath(node);
  if (written === null) return { ctx, node, path };

  if (node.kind === 'map' && node.entries.length > 1) {
    const message = `an \`${INCLUDE_KEY}\` replaces its whole node, so it takes no other key`;
    reject(ctx, CODE.includeWithSiblings, message, node.span);
    return null;
  }

  if (ctx.include === null) {
    reject(ctx, CODE.includeNotExpanded, `\`${INCLUDE_KEY}\` is not expanded here`, node.span);
    return null;
  }

  const target = filePath(written);
  if (target === null) {
    reject(ctx, CODE.badPath, `an \`${INCLUDE_KEY}\` needs a path`, node.span);
    return null;
  }

  const included = ctx.include(ctx.file, target);
  if (included === null) {
    reject(ctx, CODE.includeUnreadable, `cannot read \`${target}\``, node.span);
    return null;
  }

  if (ctx.chain.includes(included.file)) {
    const loop = [...ctx.chain, included.file].join(' → ');
    reject(ctx, CODE.includeCycle, `an \`${INCLUDE_KEY}\` comes back round: ${loop}`, node.span);
    return null;
  }

  const parsed = parse(included.source, { file: included.file });
  ctx.diagnostics.push(...parsed.diagnostics);
  if (parsed.root === null) {
    reject(ctx, CODE.includeEmpty, `\`${included.file}\` holds nothing to include`, node.span);
    return null;
  }

  const next: Ctx = {
    file: included.file,
    diagnostics: ctx.diagnostics,
    include: ctx.include,
    chain: [...ctx.chain, included.file],
  };
  return follow(next, parsed.root, []);
}

/** The path an include names, or `null` when the node is not one. */
function includePath(node: Node): string | null {
  if (node.kind !== 'map') return null;

  const entry = node.entries.find((one) => keyOf(one) === INCLUDE_KEY);
  if (entry === undefined) return null;

  const { value } = entry;
  return value.kind === 'scalar' && typeof value.value === 'string' ? value.value : '';
}
