// @vitest-environment node
import { describe, expect, it } from "vitest";

import { hashEmail, normalizeEmail } from "./hash.ts";

const KEY = "test-hash-key-0123456789abcdefghijklmnop";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail(" A@Example.com ")).toBe("a@example.com");
    expect(normalizeEmail("a@example.com")).toBe("a@example.com");
  });
});

describe("hashEmail", () => {
  it("hashEmail is a keyed HMAC of the normalized email", () => {
    // printf %s 'a@example.com' | openssl dgst -sha256 -hmac "$KEY"
    expect(hashEmail("a@example.com", KEY)).toBe(
      "e2329e7f99b10a13b0e9c231707c73d981dcb9f2487e66ad6384d7a131c1c633",
    );
    expect(hashEmail(" A@Example.com ", KEY)).toBe(hashEmail("a@example.com", KEY));
    expect(hashEmail("a@example.com", "another-test-key-abcdefghijklmnopqrstuv")).not.toBe(
      hashEmail("a@example.com", KEY),
    );
  });
});
