import { describe, expect, it } from "vitest";
import { speakerPoseToAnimMode } from "../../src/utils/dialoguePoseAnim";

describe("speakerPoseToAnimMode", () => {
  it("maps tones to distinct modes", () => {
    expect(speakerPoseToAnimMode("friendly")).toBe("sit");
    expect(speakerPoseToAnimMode("curious")).toBe("sit");
    expect(speakerPoseToAnimMode("wary")).toBe("walk_paused");
    expect(speakerPoseToAnimMode("hostile")).toBe("walk_paused");
    expect(speakerPoseToAnimMode("sleeping")).toBe("rest_dim");
    expect(speakerPoseToAnimMode("submissive")).toBe("rest");
    expect(speakerPoseToAnimMode(undefined)).toBe("sit");
  });
});
