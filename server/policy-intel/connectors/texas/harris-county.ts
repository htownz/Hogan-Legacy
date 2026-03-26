/**
 * Harris County Connector
 *
 * Fetches Harris County Commissioners Court meeting notices
 * and agenda items.
 *
 * Primary sources:
 *  - HCCC Agenda: https://agenda.harriscountytx.gov/
 *  - Legistar: https://harriscountytx.legistar.com/Feed.ashx
 */
import axios from "axios";
import * as cheerio from "cheerio";

const LEGISTAR_FEED = "https://harriscountytx.legistar.com/Feed.ashx?M=Calendar&ID=18040568&GUID=c8d5f0ea-3dc6-4b2a-a9cf-82fd1e2e4f56";
const HCCC_AGENDA_PAGE = "https://agenda.harriscountytx.gov/";

export interface HarrisCountyAgendaItem {
  title: string;
  summary: string;
  sourceUrl: string;
  publishedAt: string | null;
  rawPayload: Record<string, unknown>;
}

/**
 * Fetch Harris County Commissioners Court items from Legistar RSS feed.
 */
export async function fetchHarrisCountyItems(): Promise<{
  items: HarrisCountyAgendaItem[];
  error: string | null;
}> {
  try {
    const resp = await axios.get(LEGISTAR_FEED, { timeout: 15000 });
    const $ = cheerio.load(resp.data, { xmlMode: true });
    const items: HarrisCountyAgendaItem[] = [];

    $("item").each((_i, el) => {
      const title = $(el).find("title").text().trim();
      const link = $(el).find("link").text().trim();
      const pubDate = $(el).find("pubDate").text().trim();
      const description = $(el).find("description").text().trim();

      if (title) {
        items.push({
          title,
          summary: description.slice(0, 500),
          sourceUrl: link || HCCC_AGENDA_PAGE,
          publishedAt: pubDate || null,
          rawPayload: { source: "harris_county_legistar", feedType: "commissioners_court" },
        });
      }
    });

    return { items, error: null };
  } catch (err: any) {
    return { items: [], error: err?.message ?? String(err) };
  }
}

/**
 * Scrape HCCC agenda page for upcoming meetings.
 */
export async function fetchHarrisCountyCalendar(): Promise<{
  items: HarrisCountyAgendaItem[];
  error: string | null;
}> {
  try {
    const resp = await axios.get(HCCC_AGENDA_PAGE, { timeout: 15000 });
    const $ = cheerio.load(resp.data);
    const items: HarrisCountyAgendaItem[] = [];

    $("table tr, .agenda-item, li, a").each((_i, el) => {
      const text = $(el).text().trim();
      if (
        text.length > 15 &&
        (text.toLowerCase().includes("commissioner") ||
          text.toLowerCase().includes("agenda") ||
          text.toLowerCase().includes("court"))
      ) {
        items.push({
          title: text.slice(0, 200),
          summary: text,
          sourceUrl: HCCC_AGENDA_PAGE,
          publishedAt: null,
          rawPayload: { source: "hccc_agenda_page", feedType: "commissioners_court" },
        });
      }
    });

    return { items: items.slice(0, 20), error: null };
  } catch (err: any) {
    return { items: [], error: err?.message ?? String(err) };
  }
}
