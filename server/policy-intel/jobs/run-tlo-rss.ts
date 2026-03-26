/**
 * Job: run-tlo-rss
 * Orchestrates: fetch TLO RSS feeds → checksum dedupe → upsert source documents.
 *
 * Designed to be called:
 *  - manually via POST /api/intel/jobs/run-tlo-rss (dev + operations)
 *  - on a cron schedule once node-cron is wired in app.ts
 *
 * Idempotent: running this job twice in a row produces zero duplicate rows.
 */
import { fetchAllTloFeeds } from "../connectors/texas/tlo-rss";
import { upsertSourceDocument } from "../services/source-document-service";

export interface RunTloRssResult {
  feedsAttempted: number;
  feedErrors: { feedType: string; error: string }[];
  totalFetched: number;
  inserted: number;
  skipped: number;
  errors: { title: string; error: string }[];
}

export async function runTloRssJob(): Promise<RunTloRssResult> {
  const result: RunTloRssResult = {
    feedsAttempted: 0,
    feedErrors: [],
    totalFetched: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
  };

  const feedResults = await fetchAllTloFeeds();
  result.feedsAttempted = feedResults.length;

  for (const feedResult of feedResults) {
    if (feedResult.error) {
      result.feedErrors.push({ feedType: feedResult.feedType, error: feedResult.error });
      continue;
    }

    result.totalFetched += feedResult.documents.length;

    for (const doc of feedResult.documents) {
      try {
        const { inserted } = await upsertSourceDocument(doc);
        if (inserted) {
          result.inserted++;
        } else {
          result.skipped++;
        }
      } catch (err: any) {
        result.errors.push({
          title: doc.title,
          error: err?.message ?? String(err),
        });
      }
    }
  }

  return result;
}
