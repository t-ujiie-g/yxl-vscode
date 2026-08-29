import { type Book, speaking, type Words } from '@yxl-vscode/diag';

/** Every sentence this package says, with what fills it; an id is stable, so it is API (ADR-051). */
export type Says = {
  'units.unclosed': { char: string };
  'units.could-not-be-written': { word: string };
  'units.could-not-be-read': { word: string };
  'units.would-move-off': { word: string };
  'units.names-a-band-taken-away': { word: string; axis: string };
};

export const say = speaking<Says>();

const en: Words<Says> = {
  'units.unclosed': ({ char }) => `there is a \`${char}\` here that never closes`,
  'units.could-not-be-written': ({ word }) => `\`${word}\` could not be written again`,
  'units.could-not-be-read': ({ word }) => `\`${word}\` could not be read`,
  'units.would-move-off': ({ word }) => `\`${word}\` would move off the sheet`,
  'units.names-a-band-taken-away': ({ word, axis }) =>
    `\`${word}\` names a ${axis} this would take away`,
};

const ja: Words<Says> = {
  'units.unclosed': ({ char }) => `ここに閉じられていない \`${char}\` があります`,
  'units.could-not-be-written': ({ word }) => `\`${word}\` を書き直せませんでした`,
  'units.could-not-be-read': ({ word }) => `\`${word}\` を読めませんでした`,
  'units.would-move-off': ({ word }) => `\`${word}\` はシートの外に出てしまいます`,
  'units.names-a-band-taken-away': ({ word, axis }) =>
    `\`${word}\` は、これから削除する${axis === 'column' ? '列' : '行'}を指しています`,
};

/** This package's sentences in every language, for the edge that words them. */
export const WORDS: Book = { en, ja };
