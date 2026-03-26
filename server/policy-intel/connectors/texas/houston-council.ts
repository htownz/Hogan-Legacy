/**
 * Houston City Council Connector
 *
 * Fetches agenda items and action notices from the City of Houston
 * City Council public meeting feeds.
 *
 * Primary sources:
 *  - Houston City Council agenda: https://www.houstontx.gov/council/
 *  - Legistar API: https://houston.legistar.com/Feed.ashx
 */
import axios from "axios";
import * as cheerio from "cheerio";

const LEGISTAR_FEED = "https://houston.legistar.com/Feed.ashx?M=Calendar&ID=3955578&GUID=58f7aac2-38c2-4b5f-80e5-0bce60c4deba";
const COUNCIL_PAGE = "https://www.houstontx.gov/council/calendar.html";

export interface HoustonAgendaItem {
  title: string;
  summary: string;
  sourceUrl: string;
  publishedAt: string | null;
  rawPayload: Record<string, unknown>;
}

/**
 * Fetch Houston City Council agenda items from Legistar RSS feed.
 */
export async function fetchHoustonCouncilItems(): Promise<{
  items: HoustonAgendaItem[];
  error: string | null;
}> {
  try {
    const resp = await axios.get(LEGISTAR_FEED, { timeout: 15000 });
    const $ = cheerio.load(resp.data, { xmlMode: true });
    const items: HoustonAgendaItem[] = [];

    $("item").each((_i, el) => {
      const title = $(el).find("title").text().trim();
      const link = $(el).find("link").text().trim();
      const pubDate = $(el).find("pubDate").text().trim();
      const description = $(el).find("description").text().trim();

      if (title) {
        items.push({
          title,
          summary: description.slice(0, 500),
          sourceUrl: link || COUNCIL_PAGE,
          publishedAt: pubDate || null,
          rawPayload: { source: "houston_legistar", feedType: "council_calendar" },
        });
      }
    });

    return { items, error: null };
  } catch (err: any) {
    return { items: [], error: err?.message ?? String(err) };
  }
}

/**
 * Scrape Houston City Council calendar page for upcoming meetings.
 */
export async function fetchHoustonCouncilCalendar(): Promise<{
  items: HoustonAgendaItem[];
  error: string | null;
}> {
  try {
    const resp = await axios.get(COUNCIL_PAGE, { timeout: 15000 });
    const $ = cheerio.load(resp.data);
    const items: HoustonAgendaItem[] = [];

    // Look for meeting entries in the calendar page
    $("table tr, .meeting-item, li").each((_i, el) => {
      const text = $(el).text().trim();
      if (text.length > 20 && (text.toLowerCase().includes("council") || text.toLowerCase().includes("meeting"))) {
        items.push({
          title: text.slice(0, 200),
          summary: text,
          sourceUrl: COUNCIL_PAGE,
          publishedAt: null,
          rawPayload: { source: "houston_council_page", feedType: "council_calendar" },
        });
      }
    });

    return { items: items.slice(0, 20), error: null };
  } catch (err: any) {
    return { items: [], error: err?.message ?? String(err) };
  }
}
