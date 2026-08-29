import { describe, expect, test } from "bun:test";
import { getTenantDomainFromHost, emailMatchesTenantDomain } from "./tenant";

describe("tenant", () => {
  test("strips mail. prefix from host header", () => {
    expect(getTenantDomainFromHost("mail.j3company.com")).toBe("j3company.com");
    expect(getTenantDomainFromHost("mail.jadiweb.id:5173")).toBe("jadiweb.id");
  });

  test("leaves non-mail-prefixed hosts as-is", () => {
    expect(getTenantDomainFromHost("j3company.com")).toBe("j3company.com");
  });

  test("returns null for missing host header", () => {
    expect(getTenantDomainFromHost(null)).toBeNull();
  });

  test("matches email domain against tenant domain case-insensitively", () => {
    expect(emailMatchesTenantDomain("support@j3company.com", "j3company.com")).toBe(true);
    expect(emailMatchesTenantDomain("Support@J3Company.com", "j3company.com")).toBe(true);
    expect(emailMatchesTenantDomain("support@j3company.com", "jadiweb.id")).toBe(false);
  });
});
