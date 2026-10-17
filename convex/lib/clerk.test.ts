import { afterEach, describe, expect, it, vi } from "vitest";

import { verifiedEmails } from "./clerk";

const USER_ID = "user_test123";
const SECRET = "sk_test_fake";

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifiedEmails", () => {
  it("verifiedEmails keeps only verified addresses", async () => {
    const fetchMock = stubFetch(200, {
      id: USER_ID,
      email_addresses: [
        { email_address: "a@example.com", verification: { status: "verified" } },
        { email_address: "b@example.com", verification: { status: "unverified" } },
        { email_address: "c@example.com", verification: null },
        { email_address: "d@example.com", verification: { status: "verified" } },
      ],
    });

    await expect(verifiedEmails(USER_ID, SECRET)).resolves.toEqual([
      "a@example.com",
      "d@example.com",
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.clerk.com/v1/users/user_test123");
    expect(init?.method ?? "GET").toBe("GET");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk_test_fake");
  });

  it.each([404, 500])("verifiedEmails throws with the status on a %i response", async (status) => {
    stubFetch(status, { errors: [{ message: "nope" }] });

    const error = await verifiedEmails(USER_ID, SECRET).then(
      () => null,
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(String(status));
    expect((error as Error).message).not.toContain(SECRET);
  });
});
