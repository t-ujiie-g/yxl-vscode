import type { FacetOrigin } from './provenance';
import type { StyleLayer } from './style';

/**
 * What happens when someone edits this facet (ADR-006), derived from its origin
 * and nothing else: `direct` applies, `mediated` asks (ADR-001), `external`
 * edits the file beside the spec, `readonly` says why not.
 */
export type Editability = 'direct' | 'mediated' | 'external' | 'readonly';

/**
 * How editable a value or a format is. An `empty` origin with a cell is
 * `direct` — one place a value would go — and without one asks, since a new
 * entry and an extended `data:` rectangle are both answers. Nothing is
 * `readonly` yet.
 */
export function editabilityOf(origin: FacetOrigin): Editability {
  switch (origin.kind) {
    case 'literal':
    case 'inline':
    case 'override':
      return 'direct';
    case 'empty':
      return origin.node === null ? 'mediated' : 'direct';
    case 'external':
      return 'external';
    default:
      return 'mediated';
  }
}

/**
 * How editable one property of a look is: a definition or a band reaches many
 * cells and asks; what the cell itself said applies directly.
 */
export function editabilityOfLayer(layer: StyleLayer): Editability {
  if (layer.name !== null) return 'mediated';
  return layer.through === 'column' || layer.through === 'row' ? 'mediated' : 'direct';
}
