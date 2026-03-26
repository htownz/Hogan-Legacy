/**
 * TLO RSS Connector — Texas Legislature Online
 * Fetches the three core RSS feeds from capitol.texas.gov and normalises
 * each item into a PolicyIntelSourceDocument insert payload.
 *
 * Feeds:
 *   FiledBills       — all newly filed/introduced bills
 *   ScheduledHearings — upcoming committee hearings
 *   BillHistory      — bill status change events
 *
 * No fs/network side-effects: this module only fetches + normalises.
 * Persistence is handled by the calling job (run-tlo-rss.ts).
 */
import axios from "axios";
import * as cheerio from "cheerio";
import type { InsertPolicyIntelSourceDocument } from "@shared/schema-policy-intel";

// ── Types ────────────────────────────────────────────────────────────────────

export type TloFeedType =
  | "todaysfiledhouse"
  | "todaysfiledsenate"
  | "upcomingmeetingshouse"
  | "upcomingmeetingssenate"
  | "todaysbillspassed"
  | "todaysbillanalyses";

// ── Constants ────────────────────────────────────────────────────────────────

const TLO_RSS_BASE = "https://capitol.texas.gov/MyTLO/RSS/RSS.aspx";

/** Friendly display names for each feed type */
const FEED_LABELS: Record<TloFeedType, string> = {
  todaysfiledhouse: "Today's Bills Filed in House",
  todaysfiledsenate: "Today's Bills Filed in Senate",
  upcomingmeetingshouse: "Upcoming House Committee Meetings",
  upcomingmeetingssenate: "Upcoming Senate Committee Meetings",
  todaysbillspassed: "Today's Passed Bills",
  todaysbillanalyses: "Today's Bill Analyses",
};

const FEED_URLS: Record<TloFeedType, string> = {
  todaysfiledhouse: `${TLO_RSS_BASE}?Type=todaysfiledhouse`,
  todaysfiledsenate: `${TLO_RSS_BASE}?Type=todaysfiledsenate`,
  upcomingmeetingshouse: `${TLO_RSS_BASE}?Type=upcomingmeetingshouse`,
  upcomingmeetingssenate: `${TLO_RSS_BASE}?Type=upcomingmeetingssenate`,
  todaysbillspassed: `${TLO_RSS_BASE}?Type=todaysbillspassed`,
  todaysbillanalyses: `${TLO_RSS_BASE}?Type=todaysbillanalyses`,
};

export interface TloRssItem {
  feedType: TloFeedType;
  title: string;
  description: string;
  link: string;
  pubDate: Date | null;
  /** Extracted bill id, e.g. "HB 14" or "SB 2" — null for hearing/analysis items */
  billId: string | null;
  /** Extracted committee name — populated for hearing items */
  committee: string | null;
}

const BILL_ID_RE = /\b([HS][BJR]R?\s*\d+)\b/g;
const COMMITTEE_FIELD_RE = /Committee:\s*(.+?)(?:\n|$)/i;

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchFeed(url: string): Promise<string> {
  const response = await axios.get<string>(url, {
    timeout: 30_000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; GraceMcEwan-PolicyIntel/1.0; +https://github.com/htownz/Hogan-Legacy)",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
    responseType: "text",
  });
  return response.data;
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function extractBillId(text: string): string | null {
  // Use exec loop instead of matchAll for broader TS target compatibility
  const re = new RegExp(BILL_ID_RE.source, BILL_ID_RE.flags);
  const first = re.exec(text);
  if (!first) return null;
  // Normalise spacing: "HB14" → "HB 14"
  return first[1].replace(/([HS][BJR]R?)\s*(\d+)/, "$1 $2");
}

function extractCommittee(text: string): string | null {
  const match = text.match(COMMITTEE_FIELD_RE);
  return match ? match[1].trim() : null;
}

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function parseFeed(xml: string, feedType: TloFeedType): TloRssItem[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const items: TloRssItem[] = [];

  $("item").each((_i, el) => {
    const title = $(el).find("title").first().text().trim();
    const description = $(el).find("description").first().text().trim();
    const link = $(el).find("link").first().text().trim();
    const pubDateRaw = $(el).find("pubDate").first().text().trim() || null;

    // Skip the empty-state placeholder items TLO inserts
    if (
      title.toLowerCase().includes("no bills have been filed") ||
      title.toLowerCase().includes("no meetings scheduled") ||
      title.toLowerCase().includes("no bills passed") ||
      title.toLowerCase().includes("no analyses")
    ) {
      return;
    }

    const fullText = `${title} ${description}`;

    items.push({
      feedType,
      title,
      description,
      link,
      pubDate: parseDate(pubDateRaw),
      billId: extractBillId(fullText),
      committee: extractCommittee(description),
    });
  });

  return items;
}

// ── Normalise to schema ───────────────────────────────────────────────────────

export function normaliseToSourceDocument(
  item: TloRssItem,
): InsertPolicyIntelSourceDocument {
  // Build a stable external id: prefer bill id, fall back to link hash
  const externalId = item.billId ?? item.link;

  // Compose normalised text for full-text matching
  const normalizedText = [item.title, item.description].filter(Boolean).join("\n");

  // Tags
  const tags: string[] = [item.feedType.toLowerCase()];
  if (item.billId) tags.push(item.billId.replace(/\s+/, "_").toUpperCase());
  if (item.committee) tags.push(`committee:${item.committee.toLowerCase().replace(/\s+/g, "_")}`);

  const payload: InsertPolicyIntelSourceDocument = {
    sourceType: "texas_legislation",
    publisher: "Texas Legislature Online",
    sourceUrl: item.link || FEED_URLS[item.feedType],
    externalId,
    title: item.title,
    summary: item.description.slice(0, 500) || null,
    publishedAt: item.pubDate ?? null,
    normalizedText,
    rawPayload: {
      feedType: item.feedType,
      feedLabel: FEED_LABELS[item.feedType],
      billId: item.billId,
      committee: item.committee,
      rawDescription: item.description,
    },
    tagsJson: tags,
    checksum: null, // computed by source-document-service
  };

  return payload;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface FetchFeedResult {
  feedType: TloFeedType;
  items: TloRssItem[];
  /** Documents ready for upsert */
  documents: InsertPolicyIntelSourceDocument[];
  error: string | null;
}

/**
 * Fetch a single TLO RSS feed and return normalised documents.
 * Errors are captured per-feed so one failure doesn't block others.
 */
export async function fetchTloFeed(feedType: TloFeedType): Promise<FetchFeedResult> {
  try {
    const xml = await fetchFeed(FEED_URLS[feedType]);
    const items = parseFeed(xml, feedType);
    const documents = items.map(normaliseToSourceDocument);
    return { feedType, items, documents, error: null };
  } catch (err: any) {
    return {
      feedType,
      items: [],
      documents: [],
      error: err?.message ?? String(err),
    };
  }
}

/**
 * Fetch all six TLO RSS feeds.
 */
export async function fetchAllTloFeeds(): Promise<FetchFeedResult[]> {
  const feedTypes: TloFeedType[] = [
    "todaysfiledhouse",
    "todaysfiledsenate",
    "upcomingmeetingshouse",
    "upcomingmeetingssenate",
    "todaysbillspassed",
    "todaysbillanalyses",
  ];
  return Promise.all(feedTypes.map(fetchTloFeed));
}
