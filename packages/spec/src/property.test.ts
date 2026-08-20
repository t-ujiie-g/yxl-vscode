import { describe, expect, it } from 'vitest';
import { ordered, propertiesOf, propertiesUnder, STYLE_PROPERTIES } from './property';

describe('the leaves a `style:` key covers', () => {
  it('is the key itself where the key is a leaf', () => {
    expect(propertiesUnder('fill')).toEqual(['fill']);
    expect(propertiesUnder('format')).toEqual(['format']);
  });

  it('is every leaf of a group where the key is a group', () => {
    expect(propertiesUnder('align')).toEqual(['align.horizontal', 'align.vertical', 'align.wrap']);
    expect(propertiesUnder('font')).toHaveLength(7);
    expect(propertiesUnder('border')).toHaveLength(8);
  });

  it('is both leaves of an edge where the key is an edge, which is the unit a border is taken away at', () => {
    expect(propertiesUnder('border.left')).toEqual(['border.left.style', 'border.left.color']);
  });

  it('is nothing for a key the model does not hold', () => {
    expect(propertiesUnder('shadow')).toEqual([]);
  });
});

describe('the properties a look says something about', () => {
  it('holds the ones set and the ones taken away, and not the ones left out', () => {
    expect(propertiesOf({ fill: null, 'font.bold': true })).toEqual(['font.bold', 'fill']);
  });

  it('answers in the order the model declares them, whatever order they were written in', () => {
    expect(propertiesOf({ format: '0.0%', 'font.bold': true })).toEqual(['font.bold', 'format']);
  });
});

describe('a look put in order', () => {
  it('is the same look, written in the order that makes it the same bytes', () => {
    const said = { format: '0.0%', fill: null, 'font.bold': true } as const;

    expect(Object.keys(ordered(said))).toEqual(['font.bold', 'fill', 'format']);
    expect(ordered(said)).toEqual(said);
  });

  it('keeps only the properties named where it is given some', () => {
    const said = { 'font.bold': true, fill: null, format: '0.0%' } as const;

    expect(ordered(said, ['format', 'font.bold'])).toEqual({ 'font.bold': true, format: '0.0%' });
  });

  it('is every property the model has when it is given none', () => {
    const said = { 'font.italic': true };

    expect(ordered(said, STYLE_PROPERTIES)).toEqual(ordered(said));
  });
});
