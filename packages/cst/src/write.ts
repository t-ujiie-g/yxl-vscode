import type { ScalarStyle } from './node';
import { resolvePlain } from './scalar';

export type Value = string | number | boolean | null;

const INDICATORS = new Set('-?:,[]{}#&*!|>\'"%@`');

/**
 * A value as YAML source, keeping the `style` the replaced node had so the diff
 * says only what changed. A style that cannot carry the value is dropped.
 */
export function renderScalar(value: Value, style?: ScalarStyle): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return renderNumber(value);

  if (style === 'double') return doubleQuoted(value);
  if (style === 'single' && !value.includes('\n')) return singleQuoted(value);
  return isPlainSafe(value) ? value : doubleQuoted(value);
}

function renderNumber(value: number): string {
  if (Number.isNaN(value)) return '.nan';
  if (value === Number.POSITIVE_INFINITY) return '.inf';
  if (value === Number.NEGATIVE_INFINITY) return '-.inf';
  return String(value);
}

/** Whether text written bare reads back as itself — `resolvePlain` run backwards. */
function isPlainSafe(text: string): boolean {
  if (text === '') return false;
  if (text !== text.trim()) return false;
  if (/[\n\r\t]/.test(text)) return false;
  if (INDICATORS.has(text[0] as string)) return false;
  if (text.includes(': ') || text.endsWith(':')) return false;
  if (text.includes(' #')) return false;
  return resolvePlain(text) === text;
}

function doubleQuoted(text: string): string {
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
}

function singleQuoted(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}
