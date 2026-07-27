import { useContext } from 'react';
import { AppSettingsContext } from '../data/appSettingsProvider';

export function useAppSettings() {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) {
    throw new Error('useAppSettings must be used within an AppSettingsProvider');
  }
  return ctx;
}
