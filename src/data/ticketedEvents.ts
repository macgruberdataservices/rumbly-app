// Curated registry of Disney's hard-ticket "Special Ticketed Event" party
// menus (Mickey's Not-So-Scary Halloween Party today, presumably Mickey's
// Very Merry Christmas Party later once we know its shape in the data).
//
// Deliberately NOT auto-detected from arbitrary "contains 'exclusive'"
// category text alone -- Disney's data has other, unrelated "exclusive"
// categories (Annual Passholder Exclusive, Dinner Exclusives, brunch
// exclusives) that live under normal dining periods. The real signal is
// the combination: dining_period === "Special Ticketed Event" AND the
// category is one of a specific event's known category_group values
// (see db.ts's getMenuItemsByCategoryGroups, which enforces both halves).
// So each event is hand-registered here once its category_group is known
// from the live data, then shows/hides itself automatically after that --
// no flag to flip when Disney adds or removes the event's items.
//
// category_group is Rumbly's own slug of Disney's raw category text
// (make_slug(category) in the backend pipeline), not a stable Disney-side
// ID -- so an entry here is a bet that Disney reuses the same category
// wording the next time the event runs. Reasonable (the event's own name
// is fixed/recurring), not guaranteed: if Disney tweaks the wording, the
// entry just quietly stops matching until someone updates it here, same
// failure mode as any other scraped-text heuristic in this pipeline.
export interface TicketedEventConfig {
  id: string;
  categoryGroups: string[];
  title: string;
  subtitle: string;
  icon: string;
}

export const TICKETED_EVENTS: TicketedEventConfig[] = [
  {
    id: 'mnsshp',
    // Two variants seen in the data as of 2026-08-04: the shared category
    // most restaurants use, plus Lunching Pad filing its one exclusive
    // item under slightly different wording.
    categoryGroups: [
      'mickeys-not-so-scary-halloween-party-exclusives',
      'halloween-exclusives',
    ],
    title: "Mickey's Not-So-Scary Halloween Party",
    subtitle: 'Browse Halloween party exclusives by location',
    icon: '🎃',
  },
];
