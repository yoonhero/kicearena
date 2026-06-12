import { describe, expect, it } from "vitest";
import { getRoomLeaveAction, shouldCloseRoomForNoConnectedPlayers, validateLobbyKick, validateRoomJoin } from "./roomLifecycle";

const lobbyRoom = { hostId: "host", status: "lobby" as const };
const playingRoom = { hostId: "host", status: "playing" as const };
const finishedRoom = { hostId: "host", status: "finished" as const };
const contestRoom = { hostId: "host", status: "lobby" as const, mode: "contest" as const };

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

  it("allows joining lobby and active rooms, but rejects finished rooms", () => {
    expect(validateRoomJoin(lobbyRoom)).toEqual({ ok: true, status: "lobby" });
    expect(validateRoomJoin(playingRoom)).toEqual({ ok: true, status: "playing" });
    expect(validateRoomJoin(finishedRoom)).toEqual({ ok: false, error: "finished" });
    expect(validateRoomJoin(undefined)).toEqual({ ok: false, error: "missing-room" });
  });

  it("keeps contest rooms invite-only for the generic room join path", () => {
    expect(validateRoomJoin(contestRoom)).toEqual({ ok: false, error: "contest-invite-only" });
  });

  it("allows host to kick another lobby player", () => {
    expect(validateLobbyKick(lobbyRoom, "host", "guest")).toEqual({ ok: true, targetPlayerId: "guest" });
  });

  it("rejects non-host, self, and non-lobby kicks", () => {
    expect(validateLobbyKick(lobbyRoom, "guest", "host")).toEqual({ ok: false, error: "not-host" });
    expect(validateLobbyKick(lobbyRoom, "host", "host")).toEqual({ ok: false, error: "self-target" });
    expect(validateLobbyKick(playingRoom, "host", "guest")).toEqual({ ok: false, error: "not-lobby" });
  });

  it("closes a room only when no players remain connected", () => {
    expect(shouldCloseRoomForNoConnectedPlayers([{ connected: false }, { connected: false }])).toBe(true);
    expect(shouldCloseRoomForNoConnectedPlayers([{ connected: false }, { connected: true }])).toBe(false);
  });
});
