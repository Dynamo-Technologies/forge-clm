<script lang="ts">
  import type { IngestedDocument, DocumentExtractedField } from "$lib/types.js";
  import { formatDate } from "$lib/format.js";
  import { FileText, Download, ChevronRight, FolderOpen, Eye } from "lucide-svelte";

  export let contractId: string = "";
  export let documents: IngestedDocument[] = [];

  // Group documents by category
  $: grouped = groupByCategory(documents);

  const CATEGORY_LABELS: Record<string, string> = {
    PROPOSAL: "01. Proposal",
    AWARD: "02. Contract Setup / Awards",
    MODIFICATION: "03. Awards & Mods",
    FUNDING: "04. Funding",
    PURCHASE_ORDER: "05. PO to Dynamo",
    SUBCONTRACT: "06. Subs & Consultants",
    COMMUNICATION: "07. Communications",
    CPAR: "08. CPARs",
    DELIVERABLE: "Deliverables",
    PWS: "Performance Work Statement",
    DD254: "DD254 Security",
    CDRL: "CDRLs",
    NDA: "NDAs",
    TEAMING_AGREEMENT: "Teaming Agreements",
    OTHER: "Other",
  };

  const CATEGORY_ORDER = [
    "PROPOSAL", "AWARD", "MODIFICATION", "FUNDING", "PURCHASE_ORDER",
    "SUBCONTRACT", "COMMUNICATION", "CPAR", "DELIVERABLE",
    "PWS", "DD254", "CDRL", "NDA", "TEAMING_AGREEMENT", "OTHER",
  ];

  function groupByCategory(docs: IngestedDocument[]): Map<string, IngestedDocument[]> {
    const map = new Map<string, IngestedDocument[]>();
    for (const doc of docs) {
      const cat = doc.documentCategory;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(doc);
    }
    // Sort by category order
    const sorted = new Map<string, IngestedDocument[]>();
    for (const cat of CATEGORY_ORDER) {
      if (map.has(cat)) sorted.set(cat, map.get(cat)!);
    }
    return sorted;
  }

  let expandedCategory: string | null = null;
  let selectedDoc: IngestedDocument | null = null;

  function toggleCategory(cat: string) {
    expandedCategory = expandedCategory === cat ? null : cat;
    selectedDoc = null;
  }

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fileTypeIcon(fileType: string | null): string {
    switch (fileType) {
      case ".pdf": return "PDF";
      case ".docx": case ".doc": return "DOC";
      case ".xlsx": case ".xls": return "XLS";
      case ".pptx": case ".ppt": return "PPT";
      default: return "FILE";
    }
  }
</script>

<div data-testid="documents-tab" class="flex gap-6">
  {#if documents.length === 0}
    <div class="w-full border border-dashed border-slate-300 bg-slate-100 rounded-lg p-12 text-center">
      <svg class="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
      <h3 class="mt-4 text-sm font-heading font-medium text-slate-900">No Documents Linked</h3>
      <p class="mt-1 text-sm font-body text-slate-500">
        Documents will appear here once ingested from SharePoint and linked to this contract.
      </p>
    </div>
  {:else}
    <!-- Folder Tree -->
    <div class="w-72 shrink-0">
      <div class="rounded-lg border border-slate-300 bg-white shadow-sm">
        <div class="px-4 py-3 border-b border-slate-200">
          <h3 class="font-heading text-sm font-semibold text-slate-900">Document Folders</h3>
          <p class="font-body text-xs text-slate-500 mt-0.5">{documents.length} documents</p>
        </div>
        <nav class="py-2">
          {#each [...grouped.entries()] as [category, docs]}
            <button
              class="w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors
                {expandedCategory === category ? 'bg-coral/5 text-slate-900 font-medium' : 'text-slate-700 hover:bg-slate-50'}"
              on:click={() => toggleCategory(category)}
              data-testid="folder-{category}"
            >
              <ChevronRight
                size={14}
                class="shrink-0 transition-transform {expandedCategory === category ? 'rotate-90' : ''}"
              />
              <FolderOpen size={16} class="shrink-0 text-ash" />
              <span class="truncate font-body">{CATEGORY_LABELS[category] ?? category}</span>
              <span class="ml-auto font-mono text-xs text-slate-400">{docs.length}</span>
            </button>
          {/each}
        </nav>
      </div>
    </div>

    <!-- Document List / Preview -->
    <div class="min-w-0 flex-1">
      {#if expandedCategory && grouped.has(expandedCategory)}
        <div class="rounded-lg border border-slate-300 bg-white shadow-sm">
          <div class="px-4 py-3 border-b border-slate-200">
            <h3 class="font-heading text-sm font-semibold text-slate-900">
              {CATEGORY_LABELS[expandedCategory] ?? expandedCategory}
            </h3>
          </div>
          <div class="divide-y divide-slate-200">
            {#each grouped.get(expandedCategory) ?? [] as doc (doc.id)}
              <div
                class="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors
                  {selectedDoc?.id === doc.id ? 'bg-coral/5' : 'hover:bg-slate-50'}"
                on:click={() => (selectedDoc = doc)}
                on:keydown={(e) => e.key === 'Enter' && (selectedDoc = doc)}
                role="button"
                tabindex="0"
                data-testid="doc-row"
              >
                <span class="inline-flex items-center justify-center h-8 w-8 rounded bg-slate-100 font-mono text-xs font-bold text-slate-600">
                  {fileTypeIcon(doc.fileType)}
                </span>
                <div class="min-w-0 flex-1">
                  <div class="font-body text-sm font-medium text-slate-900 truncate">{doc.filename}</div>
                  <div class="font-body text-xs text-slate-500">
                    {formatFileSize(doc.sizeBytes)} · {doc.pageCount ?? "?"} pages · {doc.extractionStatus}
                  </div>
                </div>
                <div class="flex gap-1">
                  <a
                    href="/documents/{doc.id}"
                    class="p-1.5 rounded hover:bg-slate-200 text-slate-500"
                    title="View detail"
                  >
                    <Eye size={14} />
                  </a>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Selected Document Preview -->
        {#if selectedDoc}
          <div class="mt-4 rounded-lg border border-slate-300 bg-white shadow-sm p-4">
            <div class="flex items-start justify-between mb-3">
              <div>
                <h4 class="font-heading text-sm font-semibold text-slate-900">{selectedDoc.filename}</h4>
                <p class="font-body text-xs text-slate-500 mt-0.5">
                  {selectedDoc.fileType} · {formatFileSize(selectedDoc.sizeBytes)} · Last modified {formatDate(selectedDoc.spLastModified ?? selectedDoc.createdAt)}
                </p>
              </div>
              <a
                href="/documents/{selectedDoc.id}"
                class="inline-flex items-center gap-1.5 rounded-lg bg-coral px-3 py-1.5 text-xs font-medium text-white hover:brightness-110"
              >
                <Eye size={12} />
                Full Detail
              </a>
            </div>
            {#if selectedDoc.extractedText}
              <div class="mt-3 rounded border border-slate-200 bg-slate-50 p-3 max-h-64 overflow-y-auto">
                <p class="font-body text-xs text-slate-700 whitespace-pre-wrap">{selectedDoc.extractedText.slice(0, 2000)}{selectedDoc.extractedText.length > 2000 ? "..." : ""}</p>
              </div>
            {:else}
              <div class="mt-3 text-center py-6 text-slate-400 font-body text-sm">
                No extracted text available
              </div>
            {/if}
          </div>
        {/if}
      {:else}
        <div class="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <FolderOpen class="mx-auto h-10 w-10 text-slate-400" />
          <p class="mt-3 font-body text-sm text-slate-500">Select a folder to view documents</p>
        </div>
      {/if}
    </div>
  {/if}
</div>
