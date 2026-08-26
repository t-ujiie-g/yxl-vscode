import { imageAt, reading } from '@yxl-vscode/intent';
import { addrAt } from '@yxl-vscode/units';
import { applied, type Port, type Spec, sheetNamed } from './write';

/** A cell an image was asked for on, and the file it is to show. */
export interface Picture {
  readonly sheet: string;
  readonly row: number;
  readonly col: number;
  readonly path: string;
}

/**
 * An `images:` entry at a cell, all the way to the file. The path is written as
 * the reader's, relative to the spec, since that is how yxl resolves one
 * (`docs/spec.md` §13).
 */
export async function image(spec: Spec, picture: Picture, port: Port): Promise<void> {
  const sheet = sheetNamed(picture.sheet, port);
  if (sheet === null) return;

  const at = addrAt({ col: picture.col, row: picture.row });
  const intent = imageAt(spec, { sheet, at, path: picture.path }, reading(port.text));

  const done = await applied(spec, intent, port, { anyway: false, from: 'image', about: null });
  if (done) port.said(`\`${picture.path}\` floats from ${at}.`);
}
