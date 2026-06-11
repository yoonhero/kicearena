import { describe, expect, it } from "vitest";
import { itemEnabledForRoomMode, maxPlayersForRoomMode, normalizeRoomMode } from "./roomConfig";

describe("room mode configuration", () => {
  it("keeps casual rooms at 60 players and contest rooms at 200 players", () => {
    expect(maxPlayersForRoomMode("casual")).toBe(60);
    expect(maxPlayersForRoomMode("contest")).toBe(200);
  });

  it("forces items off for contest rooms", () => {
    expect(itemEnabledForRoomMode("casual", true)).toBe(true);
    expect(itemEnabledForRoomMode("casual", false)).toBe(false);
    expect(itemEnabledForRoomMode("contest", true)).toBe(false);
  });

  it("normalizes unknown modes to casual", () => {
    expect(normalizeRoomMode("contest")).toBe("contest");
    expect(normalizeRoomMode("other")).toBe("casual");
  });
});
