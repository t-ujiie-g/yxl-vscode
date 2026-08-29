import { sheetOf } from '@yxl-vscode/compile';
import { moveFloat, reading, sizeFloat } from '@yxl-vscode/intent';
import { addrAt, type NodeId, type SheetName } from '@yxl-vscode/units';
import type { MovedFloat, SizedFloat } from '@yxl-vscode/webview/protocol';
import type { PictureReader } from './pictures';
import { say } from './text';
import { applied, type Port, type Spec, sheetNamed } from './write';

/**
 * A float dragged to another cell: what moves is the construct's own anchor,
 * never a picture (ADR-029).
 */
export async function moved(spec: Spec, asked: MovedFloat, port: Port): Promise<void> {
  if (sheetNamed(asked.sheet, port) === null) return;

  const at = addrAt({ col: asked.col, row: asked.row });
  const intent = moveFloat({ node: asked.node as NodeId, at }, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: 'moveFloat', about: null });
  if (done) port.said(say('host.floats-from', { at }));
}

/**
 * A float dragged by its corner. A chart and a shape say their extent; an image
 * says a factor over its file's own, so the host measures the file first
 * (`docs/spec.md` §13).
 */
export async function resized(
  spec: Spec,
  asked: SizedFloat,
  port: Port,
  pictures: PictureReader | null,
): Promise<void> {
  const name = sheetNamed(asked.sheet, port);
  if (name === null) return;

  const natural = naturalOf(spec, name, asked.node, pictures);
  const where = { node: asked.node as NodeId, width: asked.width, height: asked.height, natural };
  const intent = sizeFloat(where, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: 'sizeFloat', about: null });
  if (done)
    port.said(
      say('host.takes-size', {
        width: Math.round(asked.width),
        height: Math.round(asked.height),
      }),
    );
}

/** How big the file behind an image is, which is what a drag on one is a factor of. */
function naturalOf(
  spec: Spec,
  sheet: SheetName,
  node: string,
  pictures: PictureReader | null,
): { width: number; height: number } | null {
  if (pictures === null) return null;

  const found = sheetOf(spec.grid, sheet);
  const image = found?.images.find((one) => one.node === node);
  return image === undefined ? null : pictures(spec.root, image.path);
}
