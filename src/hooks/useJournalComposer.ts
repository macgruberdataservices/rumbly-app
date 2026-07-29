import { useCallback } from 'react';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import type {
  AppRootStackParamList,
  JournalComposerRouteParams,
} from '../navigation/journalTypes';

export function useJournalComposer() {
  const navigation = useNavigation<NavigationProp<AppRootStackParamList>>();

  return useCallback(
    (params?: JournalComposerRouteParams) => {
      navigation.navigate('JournalComposer', params);
    },
    [navigation]
  );
}
