/**
 * METRO Board Connector
 *
 * Fetches Houston METRO board meeting notices and agenda items.
 *
 * Primary sources:
 *  - METRO Board: https://www.ridemetro.org/pages/board-of-directors.aspx
 *  - METRO Notices: https://www.ridemetro.org/pages/public-notices.aspx
 */
import axios from "axios";
import * as cheerio from "cheerio";

const METRO_BOARD_PAGE = "https://www.ridemetro.org/pages/board-of-directors.aspx";
const METRO_NOTICES_PAGE = "https://www.ridemetro.org/pages/public-notices.aspx";

export interface MetroBoardItem {
  title: string;
  summary: string;
  sourceUrl: string;
  publishedAt: string | null;
  rawPayload: Record<string, unknown>;
}

/**
 * Fetch METRO board meeting items from the board page.
 */
export async function fetchMetroBoardItems(): Promise<{
  items: MetroBoardItem[];
  error: string | null;
}> {
  try {
    const resp = await axios.get(METRO_BOARD_PAGE, { timeout: 15000 });
    const $ = cheerio.load(resp.data);
    const items: MetroBoardItem[] = [];

    // Look for meeting/agenda references
    $("table tr, .meeting, li, p, a").each((_i, el) => {
      const text = $(el).text().trim();
      if (
        text.length > 15 &&
        text.length < 500 &&
        (text.toLowerCase().includes("board") ||
          text.toLowerCase().includes("meeting") ||
          text.toLowerCase().includes("agenda") ||
          text.toLowerCase().includes("metro"))
      ) {
        const href = $(el).attr("href");
        items.push({
          title: text.slice(0, 200),
          summary: text,
          sourceUrl: href && href.startsWith("http") ? href : METRO_BOARD_PAGE,
          publishedAt: null,
          rawPayload: { source: "metro_board_page", feedType: "metro_board" },
        });
      }
    });

    // Deduplicate by title
    const seen = new Set<string>();
    const unique = items.filter((item) => {
      if (seen.has(item.title)) return false;
      seen.add(item.title);
      return true;
    });

    return { items: unique.slice(0, 20), error: null };
  } catch (err: any) {
    return { items: [], error: err?.message ?? String(err) };
  }
}

/**
 * Fetch METRO public notices.
 */
export async function fetchMetroNotices(): Promise<{
  items: MetroBoardItem[];
  error: string | null;
}> {
  try {
    const resp = await axios.get(METRO_NOTICES_PAGE, { timeout: 15000 });
    const $ = cheerio.load(resp.data);
    const items: MetroBoardItem[] = [];

    $("table tr, .notice, li, p").each((_i, el) => {
      const text = $(el).text().trim();
      if (
        text.length > 20 &&
        text.length < 500 &&
        (text.toLowerCase().includes("notice") ||
          text.toLowerCase().includes("hearing") ||
          text.toLowerCase().includes("procurement") ||
          text.toLowerCase().includes("contract"))
      ) {
        items.push({
          title: text.slice(0, 200),
          summary: text,
          sourceUrl: METRO_NOTICES_PAGE,
          publishedAt: null,
          rawPayload: { source: "metro_notices_page", feedType: "metro_notices" },
        });
      }
    });

    const seen = new Set<string>();
    const unique = items.filter((item) => {
      if (seen.has(item.title)) return false;
      seen.add(item.title);
      return true;
    });

    return { items: unique.slice(0, 20), error: null };
  } catch (err: any) {
    return { items: [], error: err?.message ?? String(err) };
  }
}
