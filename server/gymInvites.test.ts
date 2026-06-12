import { describe, expect, it } from "vitest";
import { hasGymEventInvite, parseGymEventInvites } from "./gymInvites.js";

describe("virtual gym invitations", () => {
  it("requires the event, account, and invite code to match", () => {
    const invites = parseGymEventInvites(
      "preliminary-day:student01=ALPHA,student02=BETA|GAMMA;other:eventer=DELTA"
    );

    expect(hasGymEventInvite(invites, "preliminary-day", "student01", "alpha")).toBe(true);
    expect(hasGymEventInvite(invites, "preliminary-day", "student02", "gamma")).toBe(true);
    expect(hasGymEventInvite(invites, "preliminary-day", "student01", "beta")).toBe(false);
    expect(hasGymEventInvite(invites, "preliminary-day", "student03", "alpha")).toBe(false);
    expect(hasGymEventInvite(invites, "other", "student01", "alpha")).toBe(false);
  });

  it("ignores malformed invite entries", () => {
    const invites = parseGymEventInvites("preliminary-day:shared-code,no-code=,valid=OK");

    expect(hasGymEventInvite(invites, "preliminary-day", "valid", "ok")).toBe(true);
    expect(hasGymEventInvite(invites, "preliminary-day", "shared-code", "shared-code")).toBe(false);
  });
});
