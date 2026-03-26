/**
 * Brief Service
 *
 * Generates evidence-backed issue briefs from source documents.
 * Hard rule: no citation = no brief.
 *
 * Flow:
 *  1. Build source pack from sourceDocumentIds (mandatory)
 *  2. Generate brief text (template-based or LLM-enhanced)
 *  3. Store in briefs + deliverables tables
 *
 * Template-based generation always works (no API key needed).
 * LLM enhancement available when ANTHROPIC_API_KEY is set.
 */
import { eq } from "drizzle-orm";
import { policyIntelDb } from "../db";
import { briefs, deliverables } from "@shared/schema-policy-intel";
import {
  buildSourcePack,
  buildCitations,
  determineProcedure,
  type SourcePack,
  type Citation,
} from "../engine/build-brief";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BriefGenerationRequest {
  workspaceId: number;
  watchlistId?: number;
  matterId?: number;
  sourceDocumentIds: number[];
  title?: string;
}

export interface BriefGenerationResult {
  briefId: number;
  deliverableId: number;
  title: string;
  bodyMarkdown: string;
  citations: Citation[];
  generatedBy: string;
}

// ── Template-based brief ─────────────────────────────────────────────────────

function generateTemplateBrief(
  title: string,
  pack: SourcePack,
  citations: Citation[],
  procedure: string,
): string {
  const sections: string[] = [];

  // Header
  sections.push(`# ${title}\n`);
  sections.push(`*Generated: ${new Date().toISOString().split("T")[0]}*\n`);

  // 1. What Changed
  sections.push(`## What Changed\n`);
  for (const entry of pack.entries) {
    sections.push(`- **${entry.title}** (${entry.publisher})`);
    if (entry.summary) sections.push(`  ${entry.summary}`);
  }

  // 2. Why It Matters
  sections.push(`\n## Why It Matters\n`);
  const topics = pack.entries
    .map((e) => e.title)
    .join("; ");
  sections.push(
    `This brief covers ${pack.entries.length} source document${pack.entries.length > 1 ? "s" : ""} related to: ${topics}. ` +
    `Review the source text below for specific language and implications.`,
  );

  // 3. Procedural Posture
  sections.push(`\n## Procedural Posture\n`);
  sections.push(procedure);

  // 4. Recommended Next Steps
  sections.push(`\n## Recommended Next Steps\n`);
  sections.push(`1. Review the linked source documents for specific language changes`);
  sections.push(`2. Assess client impact and determine if action is needed`);
  sections.push(`3. Flag for senior review if high-impact provisions identified`);

  // 5. Sources (REQUIRED)
  sections.push(`\n## Sources\n`);
  for (const c of citations) {
    sections.push(`- [${c.title}](${c.sourceUrl}) — ${c.publisher} (accessed ${c.accessedAt.split("T")[0]})`);
  }

  return sections.join("\n");
}

// ── LLM-enhanced brief ──────────────────────────────────────────────────────

async function generateLlmBrief(
  title: string,
  pack: SourcePack,
  citations: Citation[],
  procedure: string,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const systemPrompt = `You are a policy intelligence analyst for a government affairs law firm. Generate a concise, evidence-backed issue brief. You MUST only cite information from the provided source documents. Do not fabricate or assume information not in the sources.

Structure your brief exactly as:
1. ## What Changed — summarize each source document's key change
2. ## Why It Matters — explain implications for the firm's clients (transportation, procurement, local government)
3. ## Procedural Posture — ${procedure}
4. ## Recommended Next Steps — 2-3 actionable items
5. ## Sources — list each source with title, publisher, and URL

Use markdown formatting. Be specific and cite source titles when making claims.`;

    const userPrompt = `Generate an issue brief titled "${title}" from these source documents:\n\n${pack.combinedText}\n\nCitations to include:\n${citations.map((c) => `- ${c.title} (${c.publisher}) — ${c.sourceUrl}`).join("\n")}`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock ? `# ${title}\n\n${textBlock.text}` : null;
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate an issue brief from source documents.
 * Fails if sourceDocumentIds is empty (no citation = no brief).
 */
export async function generateBrief(
  req: BriefGenerationRequest,
): Promise<BriefGenerationResult> {
  if (!req.sourceDocumentIds || req.sourceDocumentIds.length === 0) {
    throw new Error("sourceDocumentIds is required — no sources, no brief");
  }

  // 1. Build source pack
  const pack = await buildSourcePack(req.sourceDocumentIds);
  const citations = buildCitations(pack);
  const procedure = determineProcedure(pack.entries);

  // 2. Determine title
  const title =
    req.title ??
    (pack.entries.length === 1
      ? `Brief: ${pack.entries[0].title}`
      : `Brief: ${pack.entries.length} Source Documents`);

  // 3. Generate brief (try LLM first, fall back to template)
  let bodyMarkdown: string;
  let generatedBy: string;

  const llmBrief = await generateLlmBrief(title, pack, citations, procedure);
  if (llmBrief) {
    bodyMarkdown = llmBrief;
    generatedBy = "anthropic-claude-sonnet";
  } else {
    bodyMarkdown = generateTemplateBrief(title, pack, citations, procedure);
    generatedBy = "template";
  }

  // 4. Store brief
  const [brief] = await policyIntelDb
    .insert(briefs)
    .values({
      workspaceId: req.workspaceId,
      watchlistId: req.watchlistId ?? null,
      title,
      status: "draft",
      briefText: bodyMarkdown,
      sourcePackJson: pack.entries.map((e) => ({
        id: e.id,
        title: e.title,
        publisher: e.publisher,
        sourceUrl: e.sourceUrl,
      })),
    })
    .returning();

  // 5. Store deliverable
  const [deliverable] = await policyIntelDb
    .insert(deliverables)
    .values({
      workspaceId: req.workspaceId,
      briefId: brief.id,
      matterId: req.matterId ?? null,
      type: "issue_brief",
      title,
      bodyMarkdown,
      sourceDocumentIds: req.sourceDocumentIds,
      citationsJson: citations.map((c) => ({ ...c })),
      generatedBy,
    })
    .returning();

  return {
    briefId: brief.id,
    deliverableId: deliverable.id,
    title,
    bodyMarkdown,
    citations,
    generatedBy,
  };
}
