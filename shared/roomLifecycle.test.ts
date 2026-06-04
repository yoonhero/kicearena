import { describe, expect, it } from "vitest";
import { getRoomLeaveAction, validateLobbyKick } from "./roomLifecycle";

const lobbyRoom = { hostId: "host", status: "lobby" as const };
const playingRoom = { hostId: "host", status: "playing" as const };

describe("room lifecycle policy", () => {
  it("removes non-host players from a lobby when they leave", () => {
    expect(getRoomLeaveAction(lobbyRoom, "guest")).toBe("remove-player");
  });

  it("closes a lobby when the host leaves", () => {
    expect(getRoomLeaveAction(lobbyRoom, "host")).toBe("close-room");
  });

  it("detaches players from active games instead of removing score rows", () => {
    expect(getRoomLeaveAction(playingRoom, "guest")).toBe("detach-player");
  });

  it("allows host to kick another lobby player", () => {
    expect(validateLobbyKick(lobbyRoom, "host", "guest")).toEqual({ ok: true, targetPlayerId: "guest" });
  });

  it("rejects non-host, self, and non-lobby kicks", () => {
    expect(validateLobbyKick(lobbyRoom, "guest", "host")).toEqual({ ok: false, error: "not-host" });
    expect(validateLobbyKick(lobbyRoom, "host", "host")).toEqual({ ok: false, error: "self-target" });
    expect(validateLobbyKick(playingRoom, "host", "guest")).toEqual({ ok: false, error: "not-lobby" });
  });
});
