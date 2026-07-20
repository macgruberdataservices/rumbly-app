import { useCallback, useRef, useState } from 'react';
import * as Location from 'expo-location';
import type { Coordinates } from '../location/proximity';

export type NearMeStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'error';
export type NearMeEnableResult = Exclude<NearMeStatus, 'idle' | 'requesting'>;

const LAST_KNOWN_MAX_AGE_MS = 5 * 60 * 1000;
const LAST_KNOWN_REQUIRED_ACCURACY_METERS = 1000;

export function useNearMe(initialOrigin: Coordinates | null = null) {
  const [origin, setOrigin] = useState<Coordinates | null>(initialOrigin);
  const [status, setStatus] = useState<NearMeStatus>(initialOrigin ? 'active' : 'idle');
  const requestIdRef = useRef(0);

  const getPermissionStatus = useCallback(async () => {
    const permission = await Location.getForegroundPermissionsAsync();
    return permission.status;
  }, []);

  const disable = useCallback(() => {
    requestIdRef.current += 1;
    setOrigin(null);
    setStatus('idle');
  }, []);

  const enable = useCallback(async (): Promise<NearMeEnableResult> => {
    const requestId = ++requestIdRef.current;
    setStatus('requesting');

    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status === Location.PermissionStatus.UNDETERMINED) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        if (requestId === requestIdRef.current) setStatus('denied');
        return 'denied';
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        if (requestId === requestIdRef.current) setStatus('unavailable');
        return 'unavailable';
      }

      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: LAST_KNOWN_MAX_AGE_MS,
        requiredAccuracy: LAST_KNOWN_REQUIRED_ACCURACY_METERS,
      });

      if (lastKnown) {
        if (requestId !== requestIdRef.current) return 'active';
        setOrigin({ latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude });
        setStatus('active');

        void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then((current) => {
            if (requestId !== requestIdRef.current) return;
            setOrigin({ latitude: current.coords.latitude, longitude: current.coords.longitude });
          })
          .catch(() => {});
        return 'active';
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (requestId !== requestIdRef.current) return 'active';
      setOrigin({ latitude: current.coords.latitude, longitude: current.coords.longitude });
      setStatus('active');
      return 'active';
    } catch {
      if (requestId === requestIdRef.current) setStatus('error');
      return 'error';
    }
  }, []);

  return {
    origin,
    status,
    isActive: status === 'active' && origin !== null,
    getPermissionStatus,
    enable,
    disable,
  };
}
