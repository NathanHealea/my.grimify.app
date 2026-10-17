export type FetchLike = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<Response>;

// Supabase's default PostgREST max-rows; a smaller server limit would end paging early, so keep it.
export const PAGE_SIZE = 1000;

export async function fetchAll(
  options: { url: string; secretKey: string; fetch: FetchLike; pageSize?: number },
  table: string,
  select: string,
  order: string,
): Promise<unknown[]> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const query = new URLSearchParams({ select, order });
  const endpoint = `${options.url}/rest/v1/${table}?${query.toString()}`;
  const rows: unknown[] = [];

  // Advance by rows received and stop only on an empty page: a server whose max-rows is below
  // pageSize returns short pages that aren't the end.
  for (let from = 0; ;) {
    const response = await options.fetch(endpoint, {
      headers: {
        apikey: options.secretKey,
        Authorization: `Bearer ${options.secretKey}`,
        "Range-Unit": "items",
        Range: `${from}-${from + pageSize - 1}`,
      },
    });
    if (!response.ok) {
      throw new Error(`Reading ${table} failed: HTTP ${response.status} ${await response.text()}`);
    }
    const page: unknown = await response.json();
    if (!Array.isArray(page)) throw new Error(`Reading ${table} returned a non-array body`);
    if (page.length === 0) return rows;
    rows.push(...(page as unknown[]));
    from += page.length;
  }
}

/**
 * Every Supabase Auth user, from the admin API. Emails come from here because the old
 * `profiles.email` copy is editable by its owner.
 */
export async function fetchAuthUsers(options: {
  url: string;
  secretKey: string;
  fetch: FetchLike;
  pageSize?: number;
}): Promise<unknown[]> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const users: unknown[] = [];
  for (let page = 1; ; page += 1) {
    const response = await options.fetch(
      `${options.url}/auth/v1/admin/users?page=${page}&per_page=${pageSize}`,
      { headers: { apikey: options.secretKey, Authorization: `Bearer ${options.secretKey}` } },
    );
    if (!response.ok) {
      throw new Error(
        `Reading auth users failed: HTTP ${response.status} ${await response.text()}`,
      );
    }
    const body: unknown = await response.json();
    const batch = (body as { users?: unknown }).users;
    if (!Array.isArray(batch)) throw new Error("Reading auth users returned no users array");
    if (batch.length === 0) return users;
    users.push(...(batch as unknown[]));
  }
}
