import Phaser from "phaser";
import { gameConfig } from "./config/GameConfig";

const game = new Phaser.Game(gameConfig);
// dev only: lets the browser console (and manual checks) reach the running game
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
