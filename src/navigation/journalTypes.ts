import type { NavigatorScreenParams } from '@react-navigation/native';
import type { RootTabParamList } from './RootNavigator';

export type JournalPageDetailRouteParams = {
  restaurantId: string;
  itemId?: string;
};

export type JournalEntryDetailRouteParams = {
  entryId: string;
};

export type JournalComposerRouteParams = {
  entryId?: string;
  draftId?: string;
  restaurantId?: string;
  itemId?: string;
  mealPeriodSnapshot?: string;
  restaurantNameSnapshot?: string;
  itemNameSnapshot?: string;
  clientId?: string;
};

export type JournalDateSearchRouteParams = {
  startDate?: string;
  endDate?: string;
};

export type JournalTargetPickerRouteParams = {
  restaurantId?: string;
  itemId?: string;
};

export type JournalStackParamList = {
  JournalHome: undefined;
  JournalPageDetail: JournalPageDetailRouteParams;
  JournalEntryDetail: JournalEntryDetailRouteParams;
  JournalDateSearch: JournalDateSearchRouteParams | undefined;
  JournalTargetPicker: JournalTargetPickerRouteParams | undefined;
  JournalStorageSettings: undefined;
};

export type AppRootStackParamList = {
  MainTabs: NavigatorScreenParams<RootTabParamList>;
  JournalComposer: JournalComposerRouteParams | undefined;
  // Lifted here rather than nested in MyRumblyNavigator -- see
  // SettingsNavigator.tsx for why.
  Settings: undefined;
};
