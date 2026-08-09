import { useContext, useEffect } from 'react';
import { NearMeContext } from '../data/nearMeProvider';
import type { Coordinates } from '../location/proximity';

export type { NearMeEnableResult, NearMeStatus } from '../data/nearMeProvider';

export function useNearMe(initialOrigin: Coordinates | null = null) {
  const context = useContext(NearMeContext);
  if (!context) throw new Error('useNearMe must be used within a NearMeProvider');

  const { restoreOrigin } = context;
  useEffect(() => {
    if (initialOrigin) restoreOrigin(initialOrigin);
  }, [initialOrigin, restoreOrigin]);

  return {
    origin: context.origin,
    status: context.status,
    isActive: context.isActive,
    getPermissionStatus: context.getPermissionStatus,
    enable: context.enable,
    disable: context.disable,
  };
}
