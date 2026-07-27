// Gap-table engine: diffs two schemas/reference-tokens.schema.json (v1)
// objects — a captured reference and JHD's own token set — the same way
// capture-figma's changes.jsonl diffs two variable collections. Pure: no
// filesystem access (see scripts/reference-compare.mjs for the CLI).

const RADIUS_TOLERANCE_PX = 1;

function toPx(value) {
  if (value == null) return null;
  const n = parseFloat(value);
  if (Number.isNaN(n)) return null;
  if (value.endsWith('rem')) return n * 16;
  return n;
}

function nearest(px, jhdRadii) {
  let best = null;
  let bestDelta = Infinity;
  for (const r of jhdRadii) {
    const jpx = toPx(r.value);
    if (jpx == null) continue;
    const delta = Math.abs(jpx - px);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = r;
    }
  }
  return best ? { value: best.value, deltaPx: Math.round(bestDelta) } : null;
}

function compareRadii(referenceRadii, jhdRadii) {
  return referenceRadii.map((r) => {
    const px = toPx(r.value);
    const match = jhdRadii.length ? nearest(px, jhdRadii) : null;
    if (!match) return { referenceValue: r.value, usageCount: r.usageCount, nearestJhdValue: null, deltaPx: null, status: 'no-jhd-radii' };
    const status = match.deltaPx <= RADIUS_TOLERANCE_PX ? 'on-scale' : 'off-scale';
    return { referenceValue: r.value, usageCount: r.usageCount, nearestJhdValue: match.value, deltaPx: match.deltaPx, status };
  });
}

function compareTypeRoles(referenceRoles, jhdRoles) {
  return referenceRoles.map((r) => {
    if (!jhdRoles.length) {
      return { role: r.role, referenceSize: r.size, matchedJhdRole: null, jhdSize: null, deltaPx: null, status: 'no-jhd-ramp' };
    }
    const refPx = toPx(r.size);
    let best = null;
    let bestDelta = Infinity;
    for (const j of jhdRoles) {
      const jPx = toPx(j.size);
      if (jPx == null || refPx == null) continue;
      const delta = Math.abs(jPx - refPx);
      if (delta < bestDelta) { bestDelta = delta; best = j; }
    }
    if (!best) return { role: r.role, referenceSize: r.size, matchedJhdRole: null, jhdSize: null, deltaPx: null, status: 'no-jhd-ramp' };
    return {
      role: r.role,
      referenceSize: r.size,
      matchedJhdRole: best.role,
      jhdSize: best.size,
      deltaPx: Math.round(bestDelta),
      status: bestDelta === 0 ? 'match' : 'gap',
    };
  });
}

function comparePalette(referencePalette, jhdPalette) {
  const jhdValues = new Set(jhdPalette.map((p) => p.value));
  return referencePalette.map((p) => ({
    referenceValue: p.value,
    usageCount: p.usageCount,
    roleGuess: p.roleGuess,
    status: jhdValues.has(p.value) ? 'match' : 'no-match',
  }));
}

function compareSpacing(referenceScale, jhdScale) {
  const referenceModule = referenceScale.module;
  const jhdModule = jhdScale.module;
  let onScale = null;
  if (referenceModule && jhdModule) {
    onScale = referenceModule % jhdModule === 0 || jhdModule % referenceModule === 0;
  }
  return { referenceModule, jhdModule, onScale };
}

function compareMotion(referenceMotion) {
  // JHD's own token set (a component design system) has no marketing-page
  // motion vocabulary to diff against — every reference motion entry is
  // reference-only signal, which is itself the finding: capture-figma has
  // no equivalent axis at all.
  return referenceMotion.map((m) => ({
    name: m.name,
    property: m.property,
    trigger: m.trigger,
    duration: m.duration,
    curve: m.curve,
    observed: m.observed,
    status: 'reference-only',
  }));
}

export function computeGapTable(reference, jhd) {
  const typeRoles = compareTypeRoles(reference.typeRoles, jhd.typeRoles);
  const radii = compareRadii(reference.radii, jhd.radii);
  const palette = comparePalette(reference.palette, jhd.palette);
  const spacing = compareSpacing(reference.spacingScale, jhd.spacingScale);
  const motion = compareMotion(reference.motionVocabulary);

  const gapStatuses = new Set(['gap', 'off-scale', 'no-match', 'no-jhd-ramp', 'no-jhd-radii']);
  const byCategory = {
    typeRoles: typeRoles.filter((r) => gapStatuses.has(r.status)).length,
    radii: radii.filter((r) => gapStatuses.has(r.status)).length,
    palette: palette.filter((r) => gapStatuses.has(r.status)).length,
    spacing: spacing.onScale === false ? 1 : 0,
  };

  return {
    schemaVersion: 1,
    reference: { name: reference.meta.name, source: reference.meta.source },
    jhd: { name: jhd.meta.name, source: jhd.meta.source },
    typeRoles,
    spacing,
    palette,
    radii,
    motion,
    stack: { reference: reference.stack, jhd: jhd.stack },
    summary: {
      totalGaps: Object.values(byCategory).reduce((a, b) => a + b, 0),
      byCategory,
    },
  };
}
