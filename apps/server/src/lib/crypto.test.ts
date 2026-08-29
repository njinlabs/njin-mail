import { describe, expect, test } from "bun:test";
import { encryptSecret, decryptSecret } from "./crypto";

describe("crypto", () => {
  test("round-trips a secret", () => {
    const plain = "hunter2!super-secret-password";
    const encrypted = encryptSecret(plain);
    expect(decryptSecret(encrypted)).toBe(plain);
  });

  test("produces different ciphertext for the same input (random iv)", () => {
    const a = encryptSecret("same-password");
    const b = encryptSecret("same-password");
    expect(a.equals(b)).toBe(false);
  });

  test("throws when the ciphertext is tampered with", () => {
    const encrypted = encryptSecret("tamper-test");
    encrypted.writeUInt8(encrypted.readUInt8(encrypted.length - 1) ^ 0xff, encrypted.length - 1);
    expect(() => decryptSecret(encrypted)).toThrow();
  });
});
