import { beforeEach, describe, expect, it, vi } from "vitest";

const clearAllConversationsMock = vi.hoisted(() => vi.fn<() => Promise<void>>());

vi.mock("phaser", () => ({
  default: {
    Scene: class {
      scene = {
        stop: vi.fn(),
        start: vi.fn(),
      };

      constructor(_config?: unknown) {}
    },
  },
}));

vi.mock("../../src/services/ConversationStore", () => ({
  clearAllConversations: clearAllConversationsMock,
}));

import { GameOverScene } from "../../src/scenes/GameOverScene";

describe("GameOverScene restart", () => {
  beforeEach(() => {
    clearAllConversationsMock.mockReset();
  });

  it("allows only one new-game restart while conversation clearing is in flight", async () => {
    let resolveClear!: () => void;
    clearAllConversationsMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveClear = resolve;
      }),
    );

    const scene = new GameOverScene() as unknown as {
      startNewGame(): Promise<void>;
      scene: { stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> };
    };

    const first = scene.startNewGame();
    const second = scene.startNewGame();

    expect(clearAllConversationsMock).toHaveBeenCalledTimes(1);

    resolveClear();
    await Promise.all([first, second]);

    expect(scene.scene.stop).toHaveBeenCalledTimes(3);
    expect(scene.scene.start).toHaveBeenCalledTimes(1);
  });

  it("resets the restart guard when Phaser initializes the scene again", async () => {
    clearAllConversationsMock.mockResolvedValue(undefined);

    const scene = new GameOverScene() as unknown as {
      init(): void;
      startNewGame(): Promise<void>;
      scene: { stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> };
    };

    await scene.startNewGame();
    scene.init();
    await scene.startNewGame();

    expect(clearAllConversationsMock).toHaveBeenCalledTimes(2);
    expect(scene.scene.start).toHaveBeenCalledTimes(2);
  });
});
