import type { NavigatorScreenParams } from '@react-navigation/native';
import type { RootTabParamList } from './RootNavigator';

export type JournalPageDetailRouteParams = {
  restaurantId: string;
  itemId?: string;
};

export type JournalComposerRouteParams = {
  entryId?: string;
  draftId?: string;
  restaurantId?: string;
  itemId?: string;
  mealPeriodSnapshot?: string;
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
  JournalComposer: JournalComposerRouteParams | undefined;
  JournalDateSearch: JournalDateSearchRouteParams | undefined;
  JournalTargetPicker: JournalTargetPickerRouteParams | undefined;
  JournalStorageSettings: undefined;
};

// The root stack will wrap the tabs when Journal UI work begins. Defining
// the contract now lets entry points agree on serializable parameters
// without changing the current navigator or adding an unfinished screen.
export type AppRootStackParamList = {
  MainTabs: NavigatorScreenParams<RootTabParamList>;
  JournalComposer: JournalComposerRouteParams | undefined;
};
