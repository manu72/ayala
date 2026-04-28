import { StoryKeys, type StoryRegistry } from "../registry/storyKeys";

export function restoreSnatchedThisNight(registry: StoryRegistry, snatcherCaptureRestart: boolean): boolean {
  return snatcherCaptureRestart || registry.get(StoryKeys.SNATCHED_THIS_NIGHT) === true;
}

export function markSnatchedThisNight(registry: StoryRegistry): void {
  registry.set(StoryKeys.SNATCHED_THIS_NIGHT, true);
}

export function consumeSnatchedThisNight(registry: StoryRegistry, snatchedThisNight: boolean): { clean: boolean } {
  registry.set(StoryKeys.SNATCHED_THIS_NIGHT, false);
  return { clean: !snatchedThisNight };
}
