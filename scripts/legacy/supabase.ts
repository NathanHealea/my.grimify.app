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

  for (let from = 0; ; from += pageSize) {
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
    rows.push(...(page as unknown[]));
    if (page.length < pageSize) return rows;
  }
}
