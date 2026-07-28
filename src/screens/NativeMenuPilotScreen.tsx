import { NativeMenuPilotContent } from './NativeMenuPilotContent';
import type { NativeMenuPilotRouteParams } from '../navigation/browseTypes';

export function NativeMenuPilotScreen({
  route,
  navigation,
}: {
  route: { params: NativeMenuPilotRouteParams };
  navigation: { goBack: () => void };
}) {
  return <NativeMenuPilotContent route={route} navigation={navigation} />;
}
