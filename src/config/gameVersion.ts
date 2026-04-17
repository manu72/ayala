import packageJson from "../../package.json";

/** Display build version (from package.json; keep in sync with root VERSION when releasing). */
export const GAME_VERSION = packageJson.version;
