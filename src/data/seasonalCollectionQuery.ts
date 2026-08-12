import type { SqlParameters } from './sqlDatabase.ts';

export interface SeasonalCollectionQuery {
  sql: string;
  params: SqlParameters;
}

// A seasonal Explore card is derived from the current menu snapshot, never a
// persisted "active" flag. The anti-join matters for categories Disney reuses
// in both ordinary and hard-ticket menus: the same canonical item at the same
// restaurant belongs to the party collection, not both cards.
export function buildGeneralSeasonalCollectionQuery(
  categoryGroups: string[],
  ticketedCategoryGroups: string[]
): SeasonalCollectionQuery | null {
  if (categoryGroups.length === 0) return null;

  const params: SqlParameters = {};
  const seasonalPlaceholders = categoryGroups.map((group, index) => {
    const key = `$seasonal${index}`;
    params[key] = group;
    return key;
  });
  const ticketedPlaceholders = ticketedCategoryGroups.map((group, index) => {
    const key = `$ticketed${index}`;
    params[key] = group;
    return key;
  });
  const ticketedExclusion = ticketedPlaceholders.length > 0
    ? `AND NOT EXISTS (
         SELECT 1
         FROM menu_items AS ticketed
         WHERE ticketed.show_in_menu = 1
           AND ticketed.restaurant_id = seasonal.restaurant_id
           AND ticketed.item_id = seasonal.item_id
           AND ticketed.dining_period = 'Special Ticketed Event'
           AND ticketed.category_group IN (${ticketedPlaceholders.join(', ')})
       )`
    : '';

  return {
    sql: `SELECT seasonal.*
          FROM menu_items AS seasonal
          WHERE seasonal.show_in_menu = 1
            AND seasonal.category_group IN (${seasonalPlaceholders.join(', ')})
            AND seasonal.dining_period <> 'Special Ticketed Event'
            ${ticketedExclusion}
          ORDER BY seasonal.restaurant_id, seasonal.item, seasonal.item_id, seasonal.dining_period;`,
    params,
  };
}
