import { parse } from '@yxl-vscode/cst';
import { describe, expect, it } from 'vitest';
import { CODE } from './codes';
import { load } from './load';

function loaded(key: string, body: string) {
  return load(parse(`sheets:\n  - name: S\n    ${key}:\n${body}`, { file: 'spec.yxl.yaml' }));
}

function codes(key: string, body: string): string[] {
  return loaded(key, body).diagnostics.map((diagnostic) => diagnostic.code);
}

function chart(body: string) {
  const one = loaded('charts', body).doc?.sheets[0]?.charts[0];
  if (one === undefined) throw new Error('no chart loaded');
  return one;
}

function image(body: string) {
  const one = loaded('images', body).doc?.sheets[0]?.images[0];
  if (one === undefined) throw new Error('no image loaded');
  return one;
}

function shape(body: string) {
  const one = loaded('shapes', body).doc?.sheets[0]?.shapes[0];
  if (one === undefined) throw new Error('no shape loaded');
  return one;
}

const PLOT = '      - at: E2\n        type: column\n        series:\n          - values: B2:B4\n';

describe('a chart', () => {
  it('reads where it sits, what it is, and what it plots', () => {
    const one = chart(
      `${PLOT}            categories: A2:A4\n            name_from: B1\n        title: Revenue\n        legend: bottom\n        size: { width: 520, height: 300 }\n`,
    );
    expect(one.at).toBe('E2');
    expect(one.type).toBe('column');
    expect(one.title).toBe('Revenue');
    expect(one.legend).toBe('bottom');
    expect(one.size).toEqual({ width: 520, height: 300 });
    expect(one.series.map((each) => [each.values, each.categories, each.nameFrom])).toEqual([
      ['B2:B4', 'A2:A4', 'B1'],
    ]);
  });

  it('reads each axis, an unset end being one Excel scales', () => {
    const one = chart(`${PLOT}        y_axis: { title: Amount, min: 0 }\n`);
    expect(one.yAxis).toEqual({ title: 'Amount', min: 0, max: null });
    expect(one.xAxis).toBeNull();
  });

  it('keeps a type and a legend a parameter fills in', () => {
    const one = chart(
      '      - at: E2\n        type: "${how}"\n        legend: "${where}"\n        series:\n          - values: B2:B4\n',
    );
    expect(one.type).toEqual({ kind: 'template', text: '${how}' });
    expect(one.legend).toEqual({ kind: 'template', text: '${where}' });
  });

  it('leaves the trimmings unsaid where the spec does', () => {
    const one = chart(PLOT);
    expect([one.title, one.legend, one.size, one.xAxis, one.yAxis]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('needs an anchor, a type, and a series', () => {
    expect(codes('charts', '      - type: column\n')).toContain(CODE.missingKey);
    expect(codes('charts', '      - at: E2\n')).toContain(CODE.missingKey);
    expect(codes('charts', '      - at: E2\n        type: column\n        series: []\n')).toContain(
      CODE.missingKey,
    );
  });

  it('refuses a type it cannot build, and a legend nowhere', () => {
    expect(codes('charts', '      - at: E2\n        type: bubble\n')).toContain(
      CODE.unknownSpelling,
    );
    expect(codes('charts', `${PLOT}        legend: middle\n`)).toContain(CODE.unknownSpelling);
  });

  it('refuses a series that names itself twice', () => {
    const both = `      - at: E2\n        type: pie\n        series:\n          - values: B2:B4\n            name: Cost\n            name_from: B1\n`;
    expect(codes('charts', both)).toContain(CODE.conflictingKeys);
  });

  it('refuses a key a chart does not have', () => {
    expect(codes('charts', `${PLOT}        colours: bright\n`)).toContain(CODE.unknownKey);
  });

  it('needs both ends of a size', () => {
    expect(codes('charts', `${PLOT}        size: { width: 520 }\n`)).toContain(CODE.missingKey);
  });
});

describe('an image', () => {
  it('reads the file, the alt text, and where it sits', () => {
    const one = image(
      '      - at: E1\n        file: assets/logo.png\n        alt: A logo\n        offset: { x: 4, y: 6 }\n        positioning: fixed\n',
    );
    expect([one.at, one.path, one.alt]).toEqual(['E1', 'assets/logo.png', 'A logo']);
    expect(one.offset).toEqual({ x: 4, y: 6 });
    expect(one.positioning).toBe('fixed');
  });

  it('reads one scale factor as both directions, and two as one each', () => {
    expect(image('      - at: E1\n        file: a.png\n        scale: 0.5\n').scale).toEqual({
      x: 0.5,
      y: 0.5,
    });
    expect(
      image('      - at: E1\n        file: a.png\n        scale: { x: 2, y: 0.5 }\n').scale,
    ).toEqual({ x: 2, y: 0.5 });
  });

  it('needs an anchor and a file', () => {
    expect(codes('images', '      - at: E1\n')).toContain(CODE.missingKey);
    expect(codes('images', '      - file: a.png\n')).toContain(CODE.missingKey);
  });

  it('refuses an anchor that is not a cell, and a positioning Excel has no name for', () => {
    expect(codes('images', '      - at: A1:B2\n        file: a.png\n')).toContain(CODE.badAddress);
    expect(
      codes('images', '      - at: E1\n        file: a.png\n        positioning: floating\n'),
    ).toContain(CODE.unknownSpelling);
  });

  it('keeps a positioning a parameter fills in', () => {
    const one = image('      - at: E1\n        file: a.png\n        positioning: "${anchored}"\n');
    expect(one.positioning).toEqual({ kind: 'template', text: '${anchored}' });
  });
});

describe('a shape', () => {
  it('reads the geometry, the extent, and the colours', () => {
    const one = shape(
      '      - at: E2\n        kind: cloud\n        size: { width: 240, height: 120 }\n        fill: "1F77B4"\n        line: { color: "333333", width: 2 }\n        alt: A stamp\n',
    );
    expect([one.at, one.kind, one.alt]).toEqual(['E2', 'cloud', 'A stamp']);
    expect(one.size).toEqual({ width: 240, height: 120 });
    expect(one.fill).toBe('1F77B4');
    expect(one.line).toEqual({ color: '333333', width: 2 });
  });

  it('reads a bare hex line as just the colour', () => {
    expect(shape('      - at: E2\n        kind: pie\n        line: "333333"\n').line).toEqual({
      color: '333333',
      width: null,
    });
  });

  it('reads one string of text as one line, and a sequence as a line each', () => {
    expect(shape('      - at: E2\n        kind: pie\n        text: Approved\n').text).toEqual([
      { text: 'Approved', font: null },
    ]);

    const lines = shape(
      '      - at: E2\n        kind: pie\n        text:\n          - Approved\n          - { text: "by me", font: { bold: true } }\n',
    ).text;
    expect(lines.map((line) => line.text)).toEqual(['Approved', 'by me']);
    expect(lines[1]?.font?.bold).toBe(true);
  });

  it('needs an anchor and a geometry, and refuses one DrawingML has no preset for', () => {
    expect(codes('shapes', '      - kind: pie\n')).toContain(CODE.missingKey);
    expect(codes('shapes', '      - at: E2\n')).toContain(CODE.missingKey);
    expect(codes('shapes', '      - at: E2\n        kind: roundrect\n')).toContain(
      CODE.unknownSpelling,
    );
  });

  it('keeps a geometry a parameter fills in', () => {
    expect(shape('      - at: E2\n        kind: "${geometry}"\n').kind).toEqual({
      kind: 'template',
      text: '${geometry}',
    });
  });

  it('refuses a line with no colour, and a fill that is not a hex colour', () => {
    expect(
      codes('shapes', '      - at: E2\n        kind: pie\n        line: { width: 2 }\n'),
    ).toContain(CODE.missingKey);
    expect(codes('shapes', '      - at: E2\n        kind: pie\n        fill: puce\n')).toContain(
      CODE.badColor,
    );
  });
});
