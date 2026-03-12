<script lang="ts">
  import type { DocumentDetail, DocumentExtractedField } from "$lib/types.js";
  import { formatDate } from "$lib/format.js";
  import { FileText, Download, ArrowLeft, ExternalLink, Copy, CheckCircle2 } from "lucide-svelte";

  export let data: { document: DocumentDetail | null };

  $: doc = data.document;

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function confidenceColor(confidence: string | null): string {
    if (!confidence) return "bg-gray-100 text-gray-600";
    const val = parseFloat(confidence);
    if (val >= 0.9) return "bg-green-100 text-green-700";
    if (val >= 0.7) return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-700";
  }

  function confidencePercent(confidence: string | null): string {
    if (!confidence) return "—";
    return `${Math.round(parseFloat(confidence) * 100)}%`;
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

  let activeSection: "text" | "fields" | "metadata" = "metadata";
  let downloadUrl: string | null = null;
  let downloading = false;

  async function handleDownload() {
    if (!doc) return;
    downloading = true;
    try {
      const apiBase = "http://localhost:3000/api/v1";
      const res = await fetch(`${apiBase}/documents/${doc.id}/download`);
      if (res.ok) {
        const { url } = await res.json();
        downloadUrl = url;
        window.open(url, "_blank");
      }
    } catch {
      // silent fail
    } finally {
      downloading = false;
    }
  }
</script>

{#if !doc}
  <div class="font-body text-center text-slate-500 py-12" data-testid="not-found">
    Document not found
  </div>
{:else}
  <div class="page-enter" data-testid="document-detail">
    <!-- Header -->
    <div class="mb-6">
      <div class="flex items-center gap-3 mb-2">
        <a href="/documents" class="font-body text-sm text-slate-500 hover:text-coral flex items-center gap-1">
          <ArrowLeft size={14} />
          Documents
        </a>
      </div>
      <div class="flex items-start justify-between">
        <div>
          <h1 class="font-heading text-2xl font-bold text-slate-900" data-testid="document-filename">
            {doc.filename}
          </h1>
          <p class="mt-1 font-body text-sm text-slate-500">
            {doc.spLibrary ?? "Unknown Library"} &middot; {doc.documentCategory.replace(/_/g, " ")}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span
            class="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium {statusBadge(doc.extractionStatus)}"
          >
            {doc.extractionStatus}
          </span>
          <button
            on:click={handleDownload}
            disabled={downloading}
            class="inline-flex items-center gap-1.5 rounded-lg bg-coral px-4 py-2 text-sm font-medium text-white hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
          >
            <Download size={14} />
            {downloading ? "Loading..." : "Download Original"}
          </button>
        </div>
      </div>
    </div>

    <!-- Section Tabs -->
    <div class="mb-6 border-b border-slate-300">
      <nav class="-mb-px flex gap-6" data-testid="section-tabs">
        {#each [{ key: "metadata", label: "Metadata" }, { key: "text", label: "Extracted Text" }, { key: "fields", label: "Extracted Fields" }] as tab}
          <button
            class="whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors duration-150
              {activeSection === tab.key
                ? 'border-coral text-slate-900 font-heading'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 font-body'}"
            on:click={() => (activeSection = tab.key as typeof activeSection)}
            data-testid="section-{tab.key}"
          >
            {tab.label}
            {#if tab.key === "fields" && doc.extractedFields.length > 0}
              <span class="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-xs">{doc.extractedFields.length}</span>
            {/if}
          </button>
        {/each}
      </nav>
    </div>

    <!-- Section Content -->
    {#if activeSection === "metadata"}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="rounded-lg border border-slate-300 bg-white shadow-sm p-5">
          <h3 class="font-heading text-sm font-semibold text-slate-900 mb-4">Document Information</h3>
          <dl class="space-y-3">
            <div class="flex justify-between">
              <dt class="font-body text-sm text-slate-500">Filename</dt>
              <dd class="font-body text-sm text-slate-900 font-medium">{doc.filename}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="font-body text-sm text-slate-500">File Type</dt>
              <dd class="font-mono text-sm text-slate-900">{doc.fileType ?? "—"}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="font-body text-sm text-slate-500">Size</dt>
              <dd class="font-body text-sm text-slate-900">{formatFileSize(doc.sizeBytes)}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="font-body text-sm text-slate-500">Pages</dt>
              <dd class="font-body text-sm text-slate-900">{doc.pageCount ?? "—"}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="font-body text-sm text-slate-500">Category</dt>
              <dd class="font-body text-sm text-slate-900">{doc.documentCategory.replace(/_/g, " ")}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="font-body text-sm text-slate-500">Extraction Method</dt>
              <dd class="font-body text-sm text-slate-900">{doc.extractionMethod ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div class="rounded-lg border border-slate-300 bg-white shadow-sm p-5">
          <h3 class="font-heading text-sm font-semibold text-slate-900 mb-4">Source Information</h3>
          <dl class="space-y-3">
            <div class="flex justify-between">
              <dt class="font-body text-sm text-slate-500">Library</dt>
              <dd class="font-body text-sm text-slate-900">{doc.spLibrary ?? "—"}</dd>
            </div>
            <div>
              <dt class="font-body text-sm text-slate-500 mb-1">SharePoint Path</dt>
              <dd class="font-mono text-xs text-slate-700 bg-slate-50 rounded p-2 break-all">{doc.spPath ?? "—"}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="font-body text-sm text-slate-500">Last Modified</dt>
              <dd class="font-mono text-sm text-slate-900">{formatDate(doc.spLastModified ?? "")}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="font-body text-sm text-slate-500">Ingested At</dt>
              <dd class="font-mono text-sm text-slate-900">{formatDate(doc.ingestedAt ?? "")}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="font-body text-sm text-slate-500">Extracted At</dt>
              <dd class="font-mono text-sm text-slate-900">{formatDate(doc.extractedAt ?? "")}</dd>
            </div>
            {#if doc.contractId}
              <div class="flex justify-between items-center">
                <dt class="font-body text-sm text-slate-500">Linked Contract</dt>
                <dd>
                  <a href="/contracts/{doc.contractId}" class="text-coral hover:text-coral-700 text-sm font-medium flex items-center gap-1">
                    View Contract <ExternalLink size={12} />
                  </a>
                </dd>
              </div>
            {/if}
          </dl>
        </div>
      </div>

    {:else if activeSection === "text"}
      <div class="rounded-lg border border-slate-300 bg-white shadow-sm">
        <div class="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 class="font-heading text-sm font-semibold text-slate-900">Extracted Text</h3>
          {#if doc.extractedText}
            <span class="font-mono text-xs text-slate-500">{doc.extractedText.length.toLocaleString()} characters</span>
          {/if}
        </div>
        {#if doc.extractedText}
          <div class="p-5 max-h-[70vh] overflow-y-auto">
            <pre class="font-body text-sm text-slate-700 whitespace-pre-wrap break-words">{doc.extractedText}</pre>
          </div>
        {:else}
          <div class="p-12 text-center">
            <FileText class="mx-auto h-10 w-10 text-slate-300" />
            <p class="mt-3 font-body text-sm text-slate-500">No extracted text available</p>
            <p class="mt-1 font-body text-xs text-slate-400">Extraction status: {doc.extractionStatus}</p>
          </div>
        {/if}
      </div>

    {:else if activeSection === "fields"}
      <div class="rounded-lg border border-slate-300 bg-white shadow-sm">
        <div class="px-5 py-3 border-b border-slate-200">
          <h3 class="font-heading text-sm font-semibold text-slate-900">Extracted Fields</h3>
        </div>
        {#if doc.extractedFields.length === 0}
          <div class="p-12 text-center">
            <p class="font-body text-sm text-slate-500">No fields extracted yet</p>
            <p class="mt-1 font-body text-xs text-slate-400">Fields are populated by the AI extraction pipeline</p>
          </div>
        {:else}
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th class="px-4 py-3 font-heading text-xs font-semibold uppercase tracking-wide text-slate-700">Field</th>
                  <th class="px-4 py-3 font-heading text-xs font-semibold uppercase tracking-wide text-slate-700">Value</th>
                  <th class="px-4 py-3 font-heading text-xs font-semibold uppercase tracking-wide text-slate-700">Confidence</th>
                  <th class="px-4 py-3 font-heading text-xs font-semibold uppercase tracking-wide text-slate-700">Page</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200">
                {#each doc.extractedFields as field (field.id)}
                  <tr class="hover:bg-slate-50">
                    <td class="px-4 py-3 font-body font-medium text-slate-900">{field.fieldName.replace(/_/g, " ")}</td>
                    <td class="px-4 py-3 font-body text-slate-700 max-w-md break-words">{field.fieldValue ?? "—"}</td>
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {confidenceColor(field.confidence)}">
                        {confidencePercent(field.confidence)}
                      </span>
                    </td>
                    <td class="px-4 py-3 font-mono text-sm text-slate-700">{field.sourcePage ?? "—"}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}
