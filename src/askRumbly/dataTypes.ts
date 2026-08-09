import type { HoursData, MenuItem, Restaurant, SearchIndexEntry } from '../data/types';

// Shared boundary for both the terminal validation adapter and the app's
// local SQLite adapter. Keeping this contract in the React-Native-safe tree
// prevents Metro from ever importing the Node filesystem cache just to type
// check an Ask Rumbly screen.
export interface AskRumblyData {
  restaurants: Restaurant[];
  searchIndex: SearchIndexEntry[];
  menuItems: MenuItem[];
  hoursData: HoursData | null;
}
