import { useContext } from 'react';
import { EntitlementsContext } from '../data/entitlementsProvider';

export function useEntitlement(featureKey: string): boolean {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) {
    throw new Error('useEntitlement must be used within an EntitlementsProvider');
  }
  return ctx.isEnabled(featureKey);
}
