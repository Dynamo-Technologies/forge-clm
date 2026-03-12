<script lang="ts">
  import type { ContractFolder, IngestedDocument, PaginatedResponse } from "$lib/types.js";
  import { formatDate } from "$lib/format.js";
  import { FolderOpen, FileText, Search, ChevronRight, Download, Eye, Filter } from "lucide-svelte";

  export let data: PaginatedResponse<IngestedDocument> & {
    folders: ContractFolder[];
    filters: {
      library: string;
      category: string;
      status: string;
      fileType: string;
      search: string;
      folderId: string;
    };
  };

  const documents = data.data ?? [];
  const pagination = data.pagination ?? { page: 1, limit: 25, total: 0, totalPages: 0 };
  const folders = data.folders ?? [];

  // Group folders by library
  $: foldersByLibrary = groupFoldersByLibrary(folders);

  function groupFoldersByLibrary(folders: ContractFolder[]): Map<string, ContractFolder[]> {
    const map = new Map<string, ContractFolder[]>();
    for (const f of folders) {
      if (!map.has(f.libraryName)) map.set(f.libraryName, []);
      map.get(f.libraryName)!.push(f);
    }
    return map;
  }

  let expandedLibrary: string | null = null;

  function toggleLibrary(lib: string) {
    expandedLibrary = expandedLibrary === lib ? null : lib;
  }

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fileTypeLabel(ft: string | null): string {
    switch (ft) {
      case ".pdf": return "PDF";
      case ".docx": case ".doc": return "Word";
      case ".xlsx": case ".xls": return "Excel";
      case ".pptx": case ".ppt": return "PowerPoint";
      case ".txt": return "Text";
      default: return ft ?? "—";
    }
  }

  function statusBadge(status: string): string {
    switch (status) {
      case "COMPLETED": return "bg-green-100 text-green-700";
      case "PROCESSING": return "bg-blue-100 text-blue-700";
      case "PENDING": return "bg-amber-100 text-amber-700";
      case "FAILED": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  }

  function pageUrl(p: number): string {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    params.set("page", String(p));
    return `?${params}`;
  }

  const EXTRACTION_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"];
  const FILE_TYPES = [".pdf", ".docx", ".doc", ".xlsx", ".pptx", ".txt"];
  const CATEGORIES = [
    "PROPOSAL", "AWARD", "MODIFICATION", "FUNDING", "PURCHASE_ORDER",
    "SUBCONTRACT", "COMMUNICATION", "CPAR", "DELIVERABLE", "PWS",
    "DD254", "CDRL", "NDA", "TEAMING_AGREEMENT", "OTHER",
  ];
</script>

<div class="page-enter flex gap-6" data-testid="documents-page">
  <!-- Folder Tree Sidebar -->
  <aside class="hidden w-64 shrink-0 lg:block" data-testid="folder-sidebar">
    <div class="rounded-lg border border-slate-300 bg-white shadow-sm">
      <div class="px-4 py-3 border-b border-slate-200">
        <h3 class="font-heading text-sm font-semibold text-slate-900">Document Libraries</h3>
        <p class="font-body text-xs text-slate-500 mt-0.5">{folders.length} folders</p>
      </div>
      <nav class="py-2 max-h-[calc(100vh-16rem)] overflow-y-auto">
        {#each [...foldersByLibrary.entries()] as [library, libraryFolders]}
          <button
            class="w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-slate-50"
            on:click={() => toggleLibrary(library)}
            data-testid="library-{library}"
          >
            <ChevronRight
              size={14}
              class="shrink-0 transition-transform {expandedLibrary === library ? 'rotate-90' : ''}"
            />
            <FolderOpen size={16} class="shrink-0 text-ash" />
            <span class="truncate font-body font-medium text-slate-700">{library}</span>
            <span class="ml-auto font-mono text-xs text-slate-400">{libraryFolders.length}</span>
          </button>
          {#if expandedLibrary === library}
            {#each libraryFolders as folder (folder.id)}
              <a
                href="?folderId={folder.id}&library={library}"
                class="flex items-center gap-2 pl-10 pr-4 py-1.5 text-sm transition-colors hover:bg-slate-50
                  {data.filters.folderId === folder.id ? 'bg-coral/5 text-slate-900' : 'text-slate-600'}"
                data-testid="folder-link"
              >
                <FolderOpen size={14} class="shrink-0 text-slate-400" />
                <span class="truncate font-body">{folder.folderName}</span>
                <span class="ml-auto font-mono text-xs text-slate-400">{folder.documentCount}</span>
              </a>
            {/each}
          {/if}
        {/each}
        {#if folders.length === 0}
          <div class="px-4 py-6 text-center text-sm text-slate-400 font-body">
            No folders synced yet
          </div>
        {/if}
      </nav>
    </div>

    <!-- Filters -->
    <form method="get" class="mt-4 rounded-lg border border-slate-300 bg-white p-4 shadow-sm space-y-3">
      <h3 class="font-heading text-sm font-semibold text-slate-900 flex items-center gap-1.5">
        <Filter size={14} />
        Filters
      </h3>

      <div>
        <label for="filter-status" class="block font-body text-xs font-medium text-slate-700">Extraction Status</label>
        <select id="filter-status" name="status" class="mt-1 w-full rounded-lg border-slate-300 text-sm" value={data.filters.status}>
          <option value="">All</option>
          {#each EXTRACTION_STATUSES as s}
            <option value={s}>{s}</option>
          {/each}
        </select>
      </div>

      <div>
        <label for="filter-filetype" class="block font-body text-xs font-medium text-slate-700">File Type</label>
        <select id="filter-filetype" name="fileType" class="mt-1 w-full rounded-lg border-slate-300 text-sm" value={data.filters.fileType}>
          <option value="">All</option>
          {#each FILE_TYPES as ft}
            <option value={ft}>{fileTypeLabel(ft)}</option>
          {/each}
        </select>
      </div>

      <div>
        <label for="filter-category" class="block font-body text-xs font-medium text-slate-700">Category</label>
        <select id="filter-category" name="category" class="mt-1 w-full rounded-lg border-slate-300 text-sm" value={data.filters.category}>
          <option value="">All</option>
          {#each CATEGORIES as cat}
            <option value={cat}>{cat.replace(/_/g, " ")}</option>
          {/each}
        </select>
      </div>

      <button
        type="submit"
        class="w-full rounded-lg bg-coral px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 active:scale-[0.98]"
      >
        Apply Filters
      </button>
    </form>
  </aside>

  <!-- Main Content -->
  <div class="min-w-0 flex-1">
    <!-- Header -->
    <div class="mb-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h2 class="font-heading text-lg font-semibold text-slate-900">Documents</h2>
        <span class="font-body text-sm text-slate-700">({pagination.total} total)</span>
      </div>
    </div>

    <!-- Search -->
    <form method="get" class="mb-4">
      <div class="relative">
        <input
          name="search"
          type="text"
          placeholder="Search extracted document text..."
          value={data.filters.search}
          class="w-full rounded-lg border border-slate-300 py-2 pl-10 pr-4 font-body text-sm focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/50"
          data-testid="search-input"
        />
        <Search class="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      </div>
    </form>

    <!-- Documents Table -->
    <div class="overflow-x-auto rounded-lg border border-slate-300 bg-white shadow-sm">
      <table class="w-full text-left text-sm" data-testid="documents-table">
        <thead class="border-b border-slate-200 bg-slate-100">
          <tr>
            <th class="whitespace-nowrap px-4 py-3 font-heading text-xs font-semibold uppercase tracking-wide text-slate-700">Filename</th>
            <th class="whitespace-nowrap px-4 py-3 font-heading text-xs font-semibold uppercase tracking-wide text-slate-700">Type</th>
            <th class="whitespace-nowrap px-4 py-3 font-heading text-xs font-semibold uppercase tracking-wide text-slate-700">Category</th>
            <th class="whitespace-nowrap px-4 py-3 font-heading text-xs font-semibold uppercase tracking-wide text-slate-700">Size</th>
            <th class="whitespace-nowrap px-4 py-3 font-heading text-xs font-semibold uppercase tracking-wide text-slate-700">Pages</th>
            <th class="whitespace-nowrap px-4 py-3 font-heading text-xs font-semibold uppercase tracking-wide text-slate-700">Status</th>
            <th class="whitespace-nowrap px-4 py-3 font-heading text-xs font-semibold uppercase tracking-wide text-slate-700">Modified</th>
            <th class="whitespace-nowrap px-4 py-3 font-heading text-xs font-semibold uppercase tracking-wide text-slate-700"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-200">
          {#if documents.length === 0}
            <tr>
              <td colspan="8" class="px-4 py-12 text-center" data-testid="empty-state">
                <FileText class="mx-auto h-10 w-10 text-slate-300" />
                <p class="mt-3 font-heading text-base font-semibold text-slate-900">No documents found</p>
                <p class="mt-1 font-body text-sm text-slate-700">Try adjusting your filters or search terms.</p>
              </td>
            </tr>
          {:else}
            {#each documents as doc (doc.id)}
              <tr class="transition-colors hover:bg-slate-50" data-testid="document-row">
                <td class="px-4 py-3">
                  <a href="/documents/{doc.id}" class="font-medium text-coral hover:text-coral-700 font-body">
                    {doc.filename}
                  </a>
                  {#if doc.spLibrary}
                    <div class="font-body text-xs text-slate-500 truncate max-w-xs">{doc.spLibrary}</div>
                  {/if}
                </td>
                <td class="px-4 py-3 font-mono text-xs text-slate-700">{fileTypeLabel(doc.fileType)}</td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {doc.documentCategory.replace(/_/g, " ")}
                  </span>
                </td>
                <td class="px-4 py-3 font-body text-slate-700">{formatFileSize(doc.sizeBytes)}</td>
                <td class="px-4 py-3 font-mono text-slate-700">{doc.pageCount ?? "—"}</td>
                <td class="px-4 py-3">
                  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {statusBadge(doc.extractionStatus)}">
                    {doc.extractionStatus}
                  </span>
                </td>
                <td class="px-4 py-3 font-mono text-xs text-slate-700">{formatDate(doc.spLastModified ?? doc.createdAt)}</td>
                <td class="px-4 py-3">
                  <a
                    href="/documents/{doc.id}"
                    class="p-1.5 rounded hover:bg-slate-200 text-slate-500 inline-flex"
                    title="View document"
                  >
                    <Eye size={14} />
                  </a>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    {#if pagination.totalPages > 1}
      <nav class="mt-4 flex items-center justify-between" data-testid="pagination">
        <span class="font-body text-sm text-slate-700">
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <div class="flex gap-1">
          {#if pagination.page > 1}
            <a
              href={pageUrl(pagination.page - 1)}
              class="rounded-lg border border-slate-300 bg-white px-3 py-1 font-body text-sm text-slate-700 hover:bg-slate-100"
            >
              Previous
            </a>
          {/if}
          {#if pagination.page < pagination.totalPages}
            <a
              href={pageUrl(pagination.page + 1)}
              class="rounded-lg border border-slate-300 bg-white px-3 py-1 font-body text-sm text-slate-700 hover:bg-slate-100"
            >
              Next
            </a>
          {/if}
        </div>
      </nav>
    {/if}
  </div>
</div>
