const RESORT_PREFIX = /^(disney'?s|walt disney world|the campsites at disney'?s)\s+/i;
const RESORT_SUFFIX = /\s+(?:resort\s*&?\s*spa|resort\s*&?\s*campground|village\s+resort|villas?\s*&\s*bungalows|resort|hotel|lodge|springs|inn|villas?|village)$/i;

function stripStackedSuffixes(value: string): string {
  let alias = value.trim();
  let previous = '';
  while (alias !== previous) {
    previous = alias;
    alias = alias.replace(RESORT_SUFFIX, '').trim();
  }
  return alias;
}

// Generates natural names from the published resort label. Tail aliases
// support compound labels such as "Port Orleans Resort - French Quarter"
// and "Animal Kingdom Villas - Kidani Village". Resort-family labels such
// as BoardWalk Inn/Villas and the two Polynesian records converge on the
// same alias, allowing the executor to include the whole guest-facing resort.
export function resortAliases(resortName: string): string[] {
  const base = resortName.replace(RESORT_PREFIX, '').trim();
  const parts = base.split(/\s+-\s+/).filter(Boolean);
  const candidates = [resortName, base, ...parts, parts.at(-1) ?? ''];
  const aliases = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate) continue;
    aliases.add(candidate.trim());
    aliases.add(candidate.replace(/[-‐‑–—]/g, ' ').replace(/\s+/g, ' ').trim());
    const stripped = stripStackedSuffixes(candidate);
    if (stripped.length >= 4) {
      aliases.add(stripped);
      aliases.add(stripped.replace(/[-‐‑–—]/g, ' ').replace(/\s+/g, ' ').trim());
    }
  }
  return Array.from(aliases).filter((alias) => alias.length >= 4);
}

export function resortFamilyAlias(resortName: string): string {
  const base = resortName.replace(RESORT_PREFIX, '').trim();
  const parts = base.split(/\s+-\s+/).filter(Boolean);
  return stripStackedSuffixes(parts.at(-1) ?? base).toLowerCase();
}

export function resortsShareGuestFacingFamily(a: string, b: string): boolean {
  return resortFamilyAlias(a) === resortFamilyAlias(b);
}
