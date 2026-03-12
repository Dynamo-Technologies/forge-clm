import type { PageServerLoad } from "./$types.js";
import type { ContractFolder, IngestedDocument, PaginatedResponse } from "$lib/types.js";

export const load: PageServerLoad = async ({ locals, fetch: skFetch, url }) => {
  const apiBase = process.env["API_URL"] ?? "http://localhost:3000/api/v1";
  const token = locals.token;
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const page = url.searchParams.get("page") ?? "1";
  const limit = url.searchParams.get("limit") ?? "25";
  const library = url.searchParams.get("library") ?? "";
  const category = url.searchParams.get("category") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const fileType = url.searchParams.get("fileType") ?? "";
  const search = url.searchParams.get("search") ?? "";
  const folderId = url.searchParams.get("folderId") ?? "";

  // Fetch folders for sidebar
  const folderQuery = new URLSearchParams();
  if (library) folderQuery.set("library", library);
  if (category) folderQuery.set("category", category);

  // Fetch documents
  const docQuery = new URLSearchParams({ page, limit });
  if (library) docQuery.set("library", library);
  if (category) docQuery.set("category", category);
  if (status) docQuery.set("status", status);
  if (fileType) docQuery.set("fileType", fileType);
  if (search) docQuery.set("search", search);

  const [foldersRes, documentsRes] = await Promise.allSettled([
    skFetch(`${apiBase}/folders?${folderQuery}`, { headers }).then((r) =>
      r.ok ? r.json() : [],
    ),
    folderId
      ? skFetch(`${apiBase}/folders/${folderId}/documents?${docQuery}`, { headers }).then((r) =>
          r.ok ? r.json() : { data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } },
        )
      : skFetch(`${apiBase}/documents?${docQuery}`, { headers }).then((r) =>
          r.ok ? r.json() : { data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } },
        ),
  ]);

  return {
    folders: (foldersRes.status === "fulfilled" ? foldersRes.value : []) as ContractFolder[],
    ...(documentsRes.status === "fulfilled"
      ? documentsRes.value
      : { data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } }) as PaginatedResponse<IngestedDocument>,
    filters: { library, category, status, fileType, search, folderId },
  };
};
