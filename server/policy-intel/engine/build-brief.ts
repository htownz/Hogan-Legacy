/**
 * Build Brief — Source Pack Composer
 *
 * Assembles a "source pack" from an array of source document IDs.
 * The source pack is the mandatory input for brief generation.
 * Hard rule: no sources = no brief.
 */
import { inArray } from "drizzle-orm";
import { policyIntelDb } from "../db";
import { sourceDocuments, type PolicyIntelSourceDocument } from "@shared/schema-policy-intel";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SourcePackEntry {
  id: number;
  title: string;
  summary: string | null;
  normalizedText: string | null;
  sourceUrl: string;
  sourceType: string;
  publisher: string;
  publishedAt: Date | null;
}

export interface SourcePack {
  entries: SourcePackEntry[];
  /** Concatenated text for LLM context window */
  combinedText: string;
}

export interface Citation {
  sourceDocumentId: number;
  title: string;
  publisher: string;
  sourceUrl: string;
  accessedAt: string;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Load source documents by IDs and compose a source pack.
 * Throws if any requested IDs are missing.
 */
export async function buildSourcePack(
  sourceDocumentIds: number[],
): Promise<SourcePack> {
  if (sourceDocumentIds.length === 0) {
    throw new Error("sourceDocumentIds must not be empty — no sources, no brief");
  }

  const docs = await policyIntelDb
    .select()
    .from(sourceDocuments)
    .where(inArray(sourceDocuments.id, sourceDocumentIds));

  const foundIds = new Set(docs.map((d) => d.id));
  const missing = sourceDocumentIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new Error(`Source documents not found: ${missing.join(", ")}`);
  }

  const entries: SourcePackEntry[] = docs.map((d) => ({
    id: d.id,
    title: d.title,
    summary: d.summary,
    normalizedText: d.normalizedText,
    sourceUrl: d.sourceUrl,
    sourceType: d.sourceType,
    publisher: d.publisher,
    publishedAt: d.publishedAt,
  }));

  const combinedText = entries
    .map(
      (e, i) =>
        `[Source ${i + 1}: ${e.title}]\nPublisher: ${e.publisher}\nURL: ${e.sourceUrl}\n${e.normalizedText ?? e.summary ?? "(no text)"}`,
    )
    .join("\n\n---\n\n");

  return { entries, combinedText };
}

/**
 * Build citations array from a source pack.
 */
export function buildCitations(pack: SourcePack): Citation[] {
  return pack.entries.map((e) => ({
    sourceDocumentId: e.id,
    title: e.title,
    publisher: e.publisher,
    sourceUrl: e.sourceUrl,
    accessedAt: new Date().toISOString(),
  }));
}

/**
 * Determine procedural posture from source types.
 */
export function determineProcedure(entries: SourcePackEntry[]): string {
  const types = new Set(entries.map((e) => e.sourceType));

  if (types.has("texas_legislation")) {
    const hasHearing = entries.some(
      (e) => e.title.toLowerCase().includes("hearing") || e.title.toLowerCase().includes("committee"),
    );
    if (hasHearing) return "Committee hearing scheduled — testimony window may be open.";
    return "Bill filed — awaiting committee referral or hearing.";
  }
  if (types.has("texas_regulation")) return "Rule or agency action published — comment period may apply.";
  if (types.has("federal_legislation")) return "Federal bill activity — monitor floor/committee action.";
  if (types.has("federal_regulation")) return "Federal regulatory action — check Federal Register for deadlines.";
  return "Source document filed — review for applicability.";
}
