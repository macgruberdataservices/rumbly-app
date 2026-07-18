import { useContext } from 'react';
import { DataContext } from '../data/dataProvider';

export function useDataProvider() {
  const ctx = useContext(DataContext);
  if (!ctx) {
    throw new Error('useDataProvider must be used within a DataProvider');
  }
  return ctx;
}
