import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { useAppSettings } from '../hooks/useAppSettings';
import { useIsDevOwner } from '../hooks/useIsDevOwner';
import type { Coordinates } from '../location/proximity';

export type NearMeStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'error';
export type NearMeEnableResult = Exclude<NearMeStatus, 'idle' | 'requesting'>;

const LAST_KNOWN_MAX_AGE_MS = 5 * 60 * 1000;
const LAST_KNOWN_REQUIRED_ACCURACY_METERS = 1000;

type OriginSource = 'gps' | 'restored' | 'override' | null;

interface NearMeState {
  origin: Coordinates | null;
  status: NearMeStatus;
  source: OriginSource;
}

export interface NearMeContextValue {
  origin: Coordinates | null;
  status: NearMeStatus;
  isActive: boolean;
  getPermissionStatus: () => Promise<Location.PermissionStatus>;
  enable: () => Promise<NearMeEnableResult>;
  disable: () => void;
  restoreOrigin: (origin: Coordinates) => void;
}

const NearMeContext = createContext<NearMeContextValue | null>(null);

export function NearMeProvider({ children }: { children: React.ReactNode }) {
  const { mockLocation } = useAppSettings();
  const isDevOwner = useIsDevOwner();
  const override = isDevOwner ? mockLocation : null;
  const [state, setState] = useState<NearMeState>({ origin: null, status: 'idle', source: null });
  const requestIdRef = useRef(0);

  // The location setting is app-session state rather than screen state. Find
  // and Ask Rumbly therefore observe and mutate the same origin. Developer
  // mock coordinates remain a transparent replacement for GPS everywhere.
  useEffect(() => {
    if (override) {
      requestIdRef.current += 1;
      setState({ origin: override, status: 'active', source: 'override' });
      return;
    }
    setState((current) => current.source === 'override'
      ? { origin: null, status: 'idle', source: null }
      : current);
  }, [override]);

  const restoreOrigin = useCallback((origin: Coordinates) => {
    setState((current) => current.origin
      ? current
      : { origin, status: 'active', source: 'restored' });
  }, []);

  const getPermissionStatus = useCallback(async () => {
    if (override) return Location.PermissionStatus.GRANTED;
    const permission = await Location.getForegroundPermissionsAsync();
    return permission.status;
  }, [override]);

  const disable = useCallback(() => {
    requestIdRef.current += 1;
    setState({ origin: null, status: 'idle', source: null });
  }, []);

  const enable = useCallback(async (): Promise<NearMeEnableResult> => {
    const requestId = ++requestIdRef.current;

    if (override) {
      setState({ origin: override, status: 'active', source: 'override' });
      return 'active';
    }

    setState({ origin: null, status: 'requesting', source: null });

    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status === Location.PermissionStatus.UNDETERMINED) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        if (requestId === requestIdRef.current) {
          setState({ origin: null, status: 'denied', source: null });
        }
        return 'denied';
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        if (requestId === requestIdRef.current) {
          setState({ origin: null, status: 'unavailable', source: null });
        }
        return 'unavailable';
      }

      const lastKnown = await Location.getLastKnownPositionAsync({
        maxAge: LAST_KNOWN_MAX_AGE_MS,
        requiredAccuracy: LAST_KNOWN_REQUIRED_ACCURACY_METERS,
      });

      if (lastKnown) {
        if (requestId !== requestIdRef.current) return 'active';
        setState({
          origin: { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude },
          status: 'active',
          source: 'gps',
        });

        void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then((current) => {
            if (requestId !== requestIdRef.current) return;
            setState({
              origin: { latitude: current.coords.latitude, longitude: current.coords.longitude },
              status: 'active',
              source: 'gps',
            });
          })
          .catch(() => {});
        return 'active';
      }

      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (requestId !== requestIdRef.current) return 'active';
      setState({
        origin: { latitude: current.coords.latitude, longitude: current.coords.longitude },
        status: 'active',
        source: 'gps',
      });
      return 'active';
    } catch {
      if (requestId === requestIdRef.current) {
        setState({ origin: null, status: 'error', source: null });
      }
      return 'error';
    }
  }, [override]);

  const value = useMemo<NearMeContextValue>(() => ({
    origin: state.origin,
    status: state.status,
    isActive: state.status === 'active' && state.origin !== null,
    getPermissionStatus,
    enable,
    disable,
    restoreOrigin,
  }), [disable, enable, getPermissionStatus, restoreOrigin, state.origin, state.status]);

  return <NearMeContext.Provider value={value}>{children}</NearMeContext.Provider>;
}

export { NearMeContext };
