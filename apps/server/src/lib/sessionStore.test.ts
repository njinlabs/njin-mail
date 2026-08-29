import { describe, expect, test } from "bun:test";
import { createSession, getSession, getSessionPassword, deleteSession, listActiveSessions } from "./sessionStore";

describe("sessionStore", () => {
  test("creates a session and retrieves its decrypted password", () => {
    const sessionId = createSession({
      userId: "user-1",
      email: "akbar@jadiweb.id",
      tenantDomain: "jadiweb.id",
      password: "hunter2!",
    });

    const session = getSession(sessionId);
    expect(session?.userId).toBe("user-1");
    expect(session?.email).toBe("akbar@jadiweb.id");
    expect(getSessionPassword(sessionId)).toBe("hunter2!");
  });

  test("deleting a session removes it", () => {
    const sessionId = createSession({
      userId: "user-2",
      email: "foo@jadiweb.id",
      tenantDomain: "jadiweb.id",
      password: "pw",
    });
    deleteSession(sessionId);
    expect(getSession(sessionId)).toBeUndefined();
    expect(getSessionPassword(sessionId)).toBeUndefined();
  });

  test("listActiveSessions includes created sessions", () => {
    const sessionId = createSession({
      userId: "user-3",
      email: "bar@jadiweb.id",
      tenantDomain: "jadiweb.id",
      password: "pw",
    });
    const ids = listActiveSessions().map(([id]) => id);
    expect(ids).toContain(sessionId);
    deleteSession(sessionId);
  });
});
