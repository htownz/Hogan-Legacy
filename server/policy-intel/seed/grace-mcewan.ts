/**
 * Grace & McEwan LLC — Seed script
 * Creates the firm workspace and its three starter watchlists.
 * Run via: POST /api/intel/seed  (dev-only)
 */
import { policyIntelDb } from "../db";
import { workspaces, watchlists } from "@shared/schema-policy-intel";
import { eq } from "drizzle-orm";

export async function seedGraceMcEwan(): Promise<{ workspace: { id: number; slug: string }; watchlistIds: number[] }> {
  // ── 1. Upsert workspace ───────────────────────────────────────────────
  let workspace: { id: number; slug: string };

  const existing = await policyIntelDb
    .select({ id: workspaces.id, slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.slug, "grace-mcewan"));

  if (existing.length > 0) {
    workspace = existing[0];
  } else {
    const [created] = await policyIntelDb
      .insert(workspaces)
      .values({
        slug: "grace-mcewan",
        name: "Grace & McEwan LLC",
        jurisdictionScope: "texas_houston",
      })
      .returning({ id: workspaces.id, slug: workspaces.slug });
    workspace = created;
  }

  // ── 2. Seed watchlists (skip if already present) ─────────────────────
  const watchlistDefs = [
    {
      name: "Transportation / Infrastructure / Mobility",
      topic: "transportation",
      description:
        "TxDOT, METRO, freight corridors, mobility projects, and road/transit procurement in Texas and Houston.",
      rulesJson: {
        keywords: [
          "TxDOT",
          "METRO",
          "freight",
          "mobility",
          "right-of-way",
          "procurement",
          "highway",
          "tollway",
          "transit",
          "infrastructure",
          "SH 288",
          "US 290",
          "Loop 610",
          "Beltway 8",
          "I-45",
          "corridor",
        ],
        committees: ["Transportation"],
        agencies: ["TxDOT", "METRO", "TTC"],
        jurisdictions: ["texas", "houston", "harris_county"],
        billPrefixes: ["HB", "SB"],
      },
    },
    {
      name: "Houston Local Government / Procurement",
      topic: "local_government",
      description:
        "Houston City Council, Harris County, METRO board, and local procurement actions relevant to firm clients.",
      rulesJson: {
        keywords: [
          "Houston City Council",
          "HCCC",
          "Harris County",
          "Beacon",
          "city contracts",
          "METRO board",
          "procurement",
          "RFP",
          "RFQ",
          "vendor",
          "contract award",
          "public improvement district",
          "PID",
          "TIF",
        ],
        committees: ["Municipal Affairs", "Local Government"],
        agencies: ["City of Houston", "Harris County", "METRO"],
        jurisdictions: ["houston", "harris_county"],
        billPrefixes: ["HB", "SB"],
      },
    },
    {
      name: "Workforce / Education / Technology",
      topic: "workforce_edtech",
      description:
        "TEA, workforce development, broadband, AI policy, and economic development initiatives in Texas.",
      rulesJson: {
        keywords: [
          "TEA",
          "workforce",
          "education",
          "AI",
          "artificial intelligence",
          "technology",
          "broadband",
          "economic development",
          "STEM",
          "apprenticeship",
          "career and technical",
          "CTE",
          "data privacy",
          "cybersecurity",
          "innovation",
          "startup",
        ],
        committees: ["Education", "Technology", "Economic Development"],
        agencies: ["TEA", "TWC", "TexasEDC"],
        jurisdictions: ["texas"],
        billPrefixes: ["HB", "SB"],
      },
    },
  ];

  const watchlistIds: number[] = [];

  for (const def of watchlistDefs) {
    const existing = await policyIntelDb
      .select({ id: watchlists.id })
      .from(watchlists)
      .where(eq(watchlists.name, def.name));

    if (existing.length > 0) {
      watchlistIds.push(existing[0].id);
      continue;
    }

    const [created] = await policyIntelDb
      .insert(watchlists)
      .values({
        workspaceId: workspace.id,
        name: def.name,
        topic: def.topic,
        description: def.description,
        rulesJson: def.rulesJson,
        isActive: true,
      })
      .returning({ id: watchlists.id });

    watchlistIds.push(created.id);
  }

  return { workspace, watchlistIds };
}
