import type { AskRumblyData as LoadedData } from '../../../../src/askRumbly/dataTypes.ts';
import { resortAliases, resortFamilyAlias } from './location_aliases.ts';
import { areaDisplayName, parkDisplayName } from '../../../../src/data/locationNames.ts';
import { normalizeForSearch } from '../../../../src/data/diacritics.ts';

export type SuggestedEntityType = 'Park' | 'Area' | 'Resort' | 'Restaurant';

export interface EntitySuggestion {
  label: string;
  type: SuggestedEntityType;
  replaceStart: number;
  replaceEnd: number;
}

interface IndexedEntity {
  label: string;
  type: SuggestedEntityType;
  aliases: string[];
}

const suggestionIndexCache = new WeakMap<LoadedData, IndexedEntity[]>();

function normalizedAliases(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => normalizeForSearch(value).replace(/[^a-z0-9]+/g, ' ').trim()).filter(Boolean)));
}

function buildSuggestionIndex(data: LoadedData): IndexedEntity[] {
  const cached = suggestionIndexCache.get(data);
  if (cached) return cached;
  const entities: IndexedEntity[] = [];

  for (const park of new Set(data.restaurants.map((restaurant) => restaurant.park).filter((value): value is string => !!value))) {
    const label = parkDisplayName(park);
    entities.push({ label, type: 'Park', aliases: normalizedAliases([label, park]) });
  }
  for (const area of new Set(data.restaurants.map((restaurant) => restaurant.area).filter((value): value is string => !!value))) {
    const label = areaDisplayName(area);
    entities.push({ label, type: 'Area', aliases: normalizedAliases(label === area ? [label, area] : [label]) });
  }

  const resortFamilies = new Map<string, { label: string; aliases: string[] }>();
  for (const resort of new Set(data.restaurants.map((restaurant) => restaurant.resort).filter((value): value is string => !!value))) {
    const family = resortFamilyAlias(resort);
    const existing = resortFamilies.get(family);
    const aliases = [...resortAliases(resort), ...(family === 'polynesian' ? ['poly'] : [])];
    if (existing) existing.aliases.push(...aliases);
    else resortFamilies.set(family, { label: resort, aliases });
  }
  for (const { label, aliases } of resortFamilies.values()) {
    entities.push({ label, type: 'Resort', aliases: normalizedAliases([label, ...aliases]) });
  }

  for (const restaurant of data.restaurants) {
    entities.push({
      label: restaurant.restaurant,
      type: 'Restaurant',
      aliases: normalizedAliases([restaurant.restaurant]),
    });
  }

  const deduped = new Map<string, IndexedEntity>();
  for (const entity of entities) {
    const key = `${entity.type}:${normalizeForSearch(entity.label).replace(/[^a-z0-9]+/g, ' ').trim()}`;
    const existing = deduped.get(key);
    if (existing) existing.aliases = normalizedAliases([...existing.aliases, ...entity.aliases]);
    else deduped.set(key, entity);
  }
  const index = Array.from(deduped.values());
  suggestionIndexCache.set(data, index);
  return index;
}

function activeFragment(query: string): { value: string; start: number; end: number } | null {
  const end = query.length;
  const connector = /\b(?:at|in|near)\s+(?:the\s+)?/gi;
  let match: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((match = connector.exec(query)) !== null) last = match;
  if (last) {
    const start = last.index + last[0].length;
    const value = query.slice(start).trimStart();
    const whitespace = query.slice(start).length - value.length;
    return value.length >= 2 ? { value, start: start + whitespace, end } : null;
  }

  const leading = query.match(/^(?:(?:does|is|are|when does|what time does)\s+(?:the\s+)?)(.+)$/i);
  if (leading && leading[1].trim().length >= 2) {
    const value = leading[1].trimStart();
    return { value, start: query.length - leading[1].length + (leading[1].length - value.length), end };
  }

  const value = query.trimStart();
  return value.length >= 2 ? { value, start: query.length - value.length, end } : null;
}

function scoreAlias(alias: string, fragment: string): number | null {
  if (alias === fragment) return 0;
  if (alias.startsWith(fragment)) return 1;
  if (alias.split(' ').some((token) => token.startsWith(fragment))) return 2;
  if (alias.includes(fragment)) return 3;
  return null;
}

export function suggestEntities(query: string, data: LoadedData, limit = 5): EntitySuggestion[] {
  const fragment = activeFragment(query);
  if (!fragment) return [];
  const normalizedFragment = normalizeForSearch(fragment.value).replace(/[^a-z0-9]+/g, ' ').trim();
  if (normalizedFragment.length < 2) return [];

  return buildSuggestionIndex(data)
    .map((entity) => {
      const score = Math.min(...entity.aliases.map((alias) => scoreAlias(alias, normalizedFragment) ?? Number.POSITIVE_INFINITY));
      return { entity, score };
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => {
      const typePriority: Record<SuggestedEntityType, number> = { Park: 0, Resort: 1, Area: 2, Restaurant: 3 };
      return (
        a.score - b.score ||
        typePriority[a.entity.type] - typePriority[b.entity.type] ||
        a.entity.label.length - b.entity.label.length ||
        a.entity.label.localeCompare(b.entity.label)
      );
    })
    .slice(0, limit)
    .map(({ entity }) => ({ label: entity.label, type: entity.type, replaceStart: fragment.start, replaceEnd: fragment.end }));
}
