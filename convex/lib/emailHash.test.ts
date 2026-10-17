import { describe, expect, it } from "vitest";

import { hashEmail as nodeHashEmail } from "../../scripts/legacy/hash";
import { hashEmail } from "./emailHash";

const KEY = "test-hash-key-0123456789abcdefghijklmnop";

describe("hashEmail", () => {
  it("hashEmail matches the export script", async () => {
    // printf %s 'a@example.com' | openssl dgst -sha256 -hmac "$KEY"
    expect(await hashEmail("a@example.com", KEY)).toBe(
      "e2329e7f99b10a13b0e9c231707c73d981dcb9f2487e66ad6384d7a131c1c633",
    );
    expect(await hashEmail(" A@Example.com ", KEY)).toBe(nodeHashEmail(" A@Example.com ", KEY));
    expect(await hashEmail(" A@Example.com ", KEY)).toBe(
      "e2329e7f99b10a13b0e9c231707c73d981dcb9f2487e66ad6384d7a131c1c633",
    );
  });
});
