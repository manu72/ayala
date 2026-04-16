/**
 * Snatcher nightly spawn policy (pure logic) lives in {@link ../utils/snatcherSpawnLogic}.
 * Patrol paths, {@link HumanNPC} construction, flee reactions, and capture handling remain on
 * {@link ../scenes/GameScene} until a dependency-injected subsystem split (see README Known Limitations).
 */
export { resolveSnatcherSpawnAction } from "../utils/snatcherSpawnLogic";
