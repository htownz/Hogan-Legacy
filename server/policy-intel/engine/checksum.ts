/**
 * Checksum utility for source document deduplication.
 * Produces a stable SHA-256 hex string from the three fields that uniquely
 * identify a legislative item: its source URL, its external identifier
 * (bill number, docket id, etc.), and the first 512 chars of its normalized text.
 *
 * If two fetches of the same item produce the same checksum the upsert layer
 * will skip the insert, keeping the source_documents table clean.
 */
import crypto from "crypto";

export function buildChecksum(
  sourceUrl: string,
  externalId: string,
  normalizedText: string,
): string {
  const stable = `${sourceUrl.trim()}::${externalId.trim()}::${normalizedText.slice(0, 512)}`;
  return crypto.createHash("sha256").update(stable, "utf8").digest("hex");
}
