import { useContext } from 'react';
import { EntitlementsContext } from '../data/entitlementsProvider';

export function useEntitlements() {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) {
    throw new Error('useEntitlements must be used within an EntitlementsProvider');
  }
  return ctx;
}
