/**
 * Source Document Service
 * Wraps all DB writes for policy_intel_source_documents.
 *
 * Key contract: upsertDocument() is idempotent — if a row with the same
 * checksum already exists it returns the existing row without writing.
 * Call buildChecksum() before calling this service.
 */
import { eq } from "drizzle-orm";
import { policyIntelDb } from "../db";
import { sourceDocuments, type InsertPolicyIntelSourceDocument, type PolicyIntelSourceDocument } from "@shared/schema-policy-intel";
import { buildChecksum } from "../engine/checksum";

export interface UpsertResult {
  doc: PolicyIntelSourceDocument;
  inserted: boolean;
}

/**
 * Upsert a source document by checksum.
 * If checksum is not supplied it will be computed from the payload.
 */
export async function upsertSourceDocument(
  payload: InsertPolicyIntelSourceDocument,
): Promise<UpsertResult> {
  const checksum =
    payload.checksum ??
    buildChecksum(
      payload.sourceUrl,
      payload.externalId ?? payload.sourceUrl,
      payload.normalizedText ?? payload.title,
    );

  // Check for existing row
  const existing = await policyIntelDb
    .select()
    .from(sourceDocuments)
    .where(eq(sourceDocuments.checksum, checksum));

  if (existing.length > 0) {
    return { doc: existing[0], inserted: false };
  }

  const [inserted] = await policyIntelDb
    .insert(sourceDocuments)
    .values({ ...payload, checksum })
    .returning();

  return { doc: inserted, inserted: true };
}

/**
 * Fetch a page of source documents (most recent first).
 */
export async function listSourceDocuments(limit = 50): Promise<PolicyIntelSourceDocument[]> {
  return policyIntelDb
    .select()
    .from(sourceDocuments)
    .orderBy(sourceDocuments.id)
    .limit(limit);
}
