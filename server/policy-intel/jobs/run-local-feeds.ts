/**
 * Job: run-local-feeds
 * Orchestrates: fetch Houston City Council, Harris County, and METRO feeds
 *   → upsert source documents (sourceType = texas_local)
 *   → match against watchlists → generate alerts.
 *
 * Call via POST /api/intel/jobs/run-local-feeds
 */
import { fetchHoustonCouncilItems } from "../connectors/texas/houston-council";
import { fetchHarrisCountyItems } from "../connectors/texas/harris-county";
import { fetchMetroBoardItems, fetchMetroNotices } from "../connectors/texas/metro-board";
import { upsertSourceDocument } from "../services/source-document-service";
import { processDocumentAlerts, type AlertCreationResult } from "../services/alert-service";
import { policyIntelDb } from "../db";
import { workspaces } from "@shared/schema-policy-intel";

export interface RunLocalFeedsResult {
  feedsAttempted: number;
  feedErrors: { feedName: string; error: string }[];
  totalFetched: number;
  inserted: number;
  skipped: number;
  errors: { title: string; error: string }[];
  alerts: {
    created: number;
    skippedDuplicate: number;
    skippedCooldown: number;
    details: { alertId: number; watchlist: string; score: number }[];
  };
}

export async function runLocalFeedsJob(): Promise<RunLocalFeedsResult> {
  const result: RunLocalFeedsResult = {
    feedsAttempted: 0,
    feedErrors: [],
    totalFetched: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
    alerts: { created: 0, skippedDuplicate: 0, skippedCooldown: 0, details: [] },
  };

  // Load all workspace ids
  const allWorkspaces = await policyIntelDb.select({ id: workspaces.id }).from(workspaces);

  // Define all local feed fetchers
  const feeds = [
    { name: "houston_council", fetch: fetchHoustonCouncilItems },
    { name: "harris_county", fetch: fetchHarrisCountyItems },
    { name: "metro_board", fetch: fetchMetroBoardItems },
    { name: "metro_notices", fetch: fetchMetroNotices },
  ];

  for (const feed of feeds) {
    result.feedsAttempted++;
    try {
      const feedResult = await feed.fetch();
      if (feedResult.error) {
        result.feedErrors.push({ feedName: feed.name, error: feedResult.error });
        continue;
      }

      result.totalFetched += feedResult.items.length;

      for (const item of feedResult.items) {
        try {
          const { doc: savedDoc, inserted } = await upsertSourceDocument({
            sourceType: "texas_local",
            publisher: feed.name,
            sourceUrl: item.sourceUrl,
            externalId: null,
            title: item.title,
            summary: item.summary,
            publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
            checksum: null,
            rawPayload: item.rawPayload,
            normalizedText: item.summary,
            tagsJson: [feed.name, "local"],
          });

          if (inserted) {
            result.inserted++;
          } else {
            result.skipped++;
          }

          // Match against watchlists for all workspaces
          for (const ws of allWorkspaces) {
            const alertResult = await processDocumentAlerts(savedDoc, ws.id);
            result.alerts.created += alertResult.created;
            result.alerts.skippedDuplicate += alertResult.skippedDuplicate;
            result.alerts.skippedCooldown += alertResult.skippedCooldown;
            result.alerts.details.push(...alertResult.details);
          }
        } catch (err: any) {
          result.errors.push({
            title: item.title,
            error: err?.message ?? String(err),
          });
        }
      }
    } catch (err: any) {
      result.feedErrors.push({ feedName: feed.name, error: err?.message ?? String(err) });
    }
  }

  return result;
}
