// This extra platform boundary is intentional. Metro can retain a previous
// fallback resolution for a newly-added screen module during Fast Refresh.
// The screen wrapper imports this fresh module path, which resolves the iOS
// implementation without requiring the installed app to be re-signed.
export {
  NativeMenuPilotScreen as NativeMenuPilotContent,
} from './NativeMenuPilotScreen.ios';
