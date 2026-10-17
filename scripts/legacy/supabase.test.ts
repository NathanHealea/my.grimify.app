// @vitest-environment node
import { describe, expect, it } from "vitest";

import { fetchAll, fetchAuthUsers, type FetchLike } from "./supabase.ts";

const SUPABASE_URL = "https://example-project.supabase.test";
const SECRET_KEY = "sb_secret_fake-key-for-tests";

type Row = { user_id: string; paint_id: string };

function syntheticRows(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    user_id: `user-${Math.floor(i / 10)}`,
    paint_id: `paint-${i}`,
  }));
}

type Request = { url: string; headers: Record<string, string> };

function rangeServer(rows: Row[], maxRows = Infinity): { fetch: FetchLike; requests: Request[] } {
  const requests: Request[] = [];
  const respond = (url: string, headers: Record<string, string>): Response => {
    requests.push({ url, headers });
    const match = /^(\d+)-(\d+)$/.exec(headers.Range ?? "");
    if (!match) return new Response("missing Range", { status: 416 });
    const from = Number(match[1]);
    const to = Number(match[2]);
    return new Response(JSON.stringify(rows.slice(from, Math.min(to + 1, from + maxRows))), {
      status: 206,
    });
  };
  const fetch: FetchLike = (url, init) => Promise.resolve(respond(url, init.headers));
  return { fetch, requests };
}

describe("fetchAll pages through PostgREST", () => {
  it("returns all 2,500 rows across pages of 1,000", async () => {
    const rows = syntheticRows(2500);
    const server = rangeServer(rows);

    const result = await fetchAll(
      { url: SUPABASE_URL, secretKey: SECRET_KEY, fetch: server.fetch, pageSize: 1000 },
      "user_paints",
      "user_id,paint_id",
      "user_id,paint_id",
    );

    expect(result).toEqual(rows);
    expect(server.requests.map((r) => r.headers.Range)).toEqual([
      "0-999",
      "1000-1999",
      "2000-2999",
      "2500-3499",
    ]);
  });

  it("reads every row when the server caps pages below the page size", async () => {
    const rows = syntheticRows(2500);
    const server = rangeServer(rows, 500);

    const result = await fetchAll(
      { url: SUPABASE_URL, secretKey: SECRET_KEY, fetch: server.fetch, pageSize: 1000 },
      "user_paints",
      "user_id,paint_id",
      "user_id,paint_id",
    );

    expect(result).toEqual(rows);
  });

  it("stops at the first empty page", async () => {
    const rows = syntheticRows(2000);
    const server = rangeServer(rows);

    const result = await fetchAll(
      { url: SUPABASE_URL, secretKey: SECRET_KEY, fetch: server.fetch, pageSize: 1000 },
      "user_paints",
      "user_id,paint_id",
      "user_id,paint_id",
    );

    expect(result).toHaveLength(2000);
    expect(server.requests).toHaveLength(3);
  });

  it("requests the table with select and order and sends the secret key", async () => {
    const server = rangeServer(syntheticRows(5));

    await fetchAll(
      { url: SUPABASE_URL, secretKey: SECRET_KEY, fetch: server.fetch, pageSize: 1000 },
      "user_paints",
      "user_id,paint_id",
      "user_id,paint_id",
    );

    expect(server.requests).toHaveLength(2);
    const [request] = server.requests;
    const url = new URL(request.url);
    expect(url.origin).toBe(SUPABASE_URL);
    expect(url.pathname).toBe("/rest/v1/user_paints");
    expect(url.searchParams.get("select")).toBe("user_id,paint_id");
    expect(url.searchParams.get("order")).toBe("user_id,paint_id");
    expect(request.headers.apikey).toBe(SECRET_KEY);
    expect(request.headers.Authorization).toBe(`Bearer ${SECRET_KEY}`);
    expect(request.headers["Range-Unit"]).toBe("items");
  });

  it("throws with the table name and status on a non-2xx response", async () => {
    const fetch: FetchLike = () =>
      Promise.resolve(new Response("permission denied", { status: 401 }));

    const read = fetchAll(
      { url: SUPABASE_URL, secretKey: SECRET_KEY, fetch },
      "user_paints",
      "user_id,paint_id",
      "user_id,paint_id",
    );

    await expect(read).rejects.toThrow(/user_paints/);
    await expect(read).rejects.toThrow(/401/);
  });

  it("throws with the table name when the body is not an array", async () => {
    const fetch: FetchLike = () =>
      Promise.resolve(new Response(JSON.stringify({ message: "oops" }), { status: 200 }));

    await expect(
      fetchAll({ url: SUPABASE_URL, secretKey: SECRET_KEY, fetch }, "user_paints", "*", "id"),
    ).rejects.toThrow("Reading user_paints returned a non-array body");
  });
});

describe("fetchAuthUsers pages through the auth admin API", () => {
  it("reads every page until an empty one and sends the secret key", async () => {
    const users = Array.from({ length: 5 }, (_, i) => ({
      id: `user-${i}`,
      email: `u${i}@example.com`,
    }));
    const requests: Request[] = [];
    const fetch: FetchLike = (url, init) => {
      requests.push({ url, headers: init.headers });
      const page = Number(new URL(url).searchParams.get("page"));
      const perPage = Number(new URL(url).searchParams.get("per_page"));
      const batch = users.slice((page - 1) * perPage, page * perPage);
      return Promise.resolve(new Response(JSON.stringify({ users: batch }), { status: 200 }));
    };

    const result = await fetchAuthUsers({
      url: SUPABASE_URL,
      secretKey: SECRET_KEY,
      fetch,
      pageSize: 2,
    });

    expect(result).toEqual(users);
    expect(requests.map((r) => new URL(r.url).pathname)).toEqual(
      Array(4).fill("/auth/v1/admin/users"),
    );
    expect(requests[0]?.headers).toMatchObject({
      apikey: SECRET_KEY,
      Authorization: `Bearer ${SECRET_KEY}`,
    });
  });

  it("throws on a non-2xx response", async () => {
    const fetch: FetchLike = () => Promise.resolve(new Response("nope", { status: 401 }));
    await expect(
      fetchAuthUsers({ url: SUPABASE_URL, secretKey: SECRET_KEY, fetch }),
    ).rejects.toThrow("HTTP 401");
  });

  it("throws when the body has no users array", async () => {
    const fetch: FetchLike = () =>
      Promise.resolve(new Response(JSON.stringify({ message: "oops" }), { status: 200 }));
    await expect(
      fetchAuthUsers({ url: SUPABASE_URL, secretKey: SECRET_KEY, fetch }),
    ).rejects.toThrow("no users array");
  });
});
