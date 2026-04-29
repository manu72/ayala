import { StoryKeys, type StoryRegistry } from "../registry/storyKeys";

export function markGameOver(registry: StoryRegistry): void {
  registry.set(StoryKeys.GAME_OVER, true);
}
