import { type Book, speaking, type Words } from '@yxl-vscode/diag';

/** Every sentence this package says; an id is stable, so it is API (ADR-051). */
export type Says = {
  'refactor.gather-a-style': { sites: number };
  'refactor.merge-definitions': { many: number };
  'refactor.write-as-a-range': { many: number; at: string };
};

export const say = speaking<Says>();

const en: Words<Says> = {
  'refactor.gather-a-style': ({ sites }) =>
    `Gather the look written at ${sites} places into one \`defs.styles\` entry`,
  'refactor.merge-definitions': ({ many }) =>
    `Leave one of the ${many} definitions that say the same thing, and let the rest follow it`,
  'refactor.write-as-a-range': ({ many, at }) =>
    `Say the ${many} formulas over \`${at}\` once, as the range that fills them`,
};

const ja: Words<Says> = {
  'refactor.gather-a-style': ({ sites }) =>
    `${sites} 箇所に書かれている同じ見た目を、\`defs.styles\` の 1 つの定義にまとめる`,
  'refactor.merge-definitions': ({ many }) =>
    `同じことを言っている ${many} つの定義を 1 つにし、残りをそれに従わせる`,
  'refactor.write-as-a-range': ({ many, at }) =>
    `\`${at}\` の ${many} 個の数式を、それを埋める範囲として 1 度だけ書く`,
};

/** This package's sentences in every language, for the edge that renders them. */
export const WORDS: Book = { en, ja };
