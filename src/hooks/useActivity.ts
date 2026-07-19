import { useContext } from 'react';
import { ActivityContext } from '../data/activityProvider';

export function useActivity() {
  const ctx = useContext(ActivityContext);
  if (!ctx) {
    throw new Error('useActivity must be used within an ActivityProvider');
  }
  return ctx;
}
