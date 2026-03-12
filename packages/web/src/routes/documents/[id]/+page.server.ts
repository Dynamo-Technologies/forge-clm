import type { PageServerLoad } from "./$types.js";
import type { DocumentDetail } from "$lib/types.js";

export const load: PageServerLoad = async ({ locals, fetch: skFetch, params }) => {
  const apiBase = process.env["API_URL"] ?? "http://localhost:3000/api/v1";
  const token = locals.token;
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const id = params.id;

  try {
    const res = await skFetch(`${apiBase}/documents/${id}`, { headers });
    if (!res.ok) return { document: null };
    const document = (await res.json()) as DocumentDetail;
    return { document };
  } catch {
    return { document: null };
  }
};
