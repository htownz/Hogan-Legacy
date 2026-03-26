import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { policyIntelDb } from "./db";
import { alerts, briefs, monitoringJobs, sourceDocuments, watchlists, workspaces } from "@shared/schema-policy-intel";
import { seedGraceMcEwan } from "./seed/grace-mcewan";
import { runTloRssJob } from "./jobs/run-tlo-rss";

export function createPolicyIntelRouter() {
  const router = Router();

  router.get("/health", async (_req, res) => {
    res.json({ ok: true, service: "policy-intel", scope: "us-federal-texas" });
  });

  router.get("/", async (_req, res) => {
    res.json({
      service: "ActUp Policy Intel",
      scope: ["us_federal", "texas"],
      routes: [
        "/api/intel/workspaces",
        "/api/intel/watchlists",
        "/api/intel/source-documents",
        "/api/intel/alerts",
        "/api/intel/briefs",
        "/api/intel/jobs"
      ]
    });
  });

  router.get("/workspaces", async (_req, res, next) => {
    try {
      const rows = await policyIntelDb.select().from(workspaces).orderBy(workspaces.id);
      res.json(rows);
    } catch (err: any) {
      next(err);
    }
  });

  router.post("/workspaces", async (req, res, next) => {
    try {
      const { slug, name } = req.body ?? {};
      if (!slug || !name) {
        return res.status(400).json({ message: "slug and name are required" });
      }

      const [created] = await policyIntelDb
        .insert(workspaces)
        .values({ slug, name })
        .returning();

      res.status(201).json(created);
    } catch (err: any) {
      next(err);
    }
  });

  router.get("/watchlists", async (_req, res, next) => {
    try {
      const rows = await policyIntelDb.select().from(watchlists).orderBy(desc(watchlists.id));
      res.json(rows);
    } catch (err: any) {
      next(err);
    }
  });

  router.post("/watchlists", async (req, res, next) => {
    try {
      const { workspaceId, name, topic, description, rulesJson } = req.body ?? {};
      if (!workspaceId || !name) {
        return res.status(400).json({ message: "workspaceId and name are required" });
      }

      const [created] = await policyIntelDb
        .insert(watchlists)
        .values({
          workspaceId: Number(workspaceId),
          name,
          topic,
          description,
          rulesJson: rulesJson ?? {},
        })
        .returning();

      res.status(201).json(created);
    } catch (err: any) {
      next(err);
    }
  });

  router.get("/watchlists/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const [watchlist] = await policyIntelDb.select().from(watchlists).where(eq(watchlists.id, id));
      if (!watchlist) {
        return res.status(404).json({ message: "watchlist not found" });
      }
      res.json(watchlist);
    } catch (err: any) {
      next(err);
    }
  });

  router.post("/source-documents", async (req, res, next) => {
    try {
      const {
        sourceType,
        publisher,
        sourceUrl,
        externalId,
        title,
        summary,
        publishedAt,
        checksum,
        rawPayload,
        normalizedText,
        tagsJson,
      } = req.body ?? {};

      if (!sourceType || !publisher || !sourceUrl || !title) {
        return res.status(400).json({
          message: "sourceType, publisher, sourceUrl, and title are required",
        });
      }

      const [created] = await policyIntelDb
        .insert(sourceDocuments)
        .values({
          sourceType,
          publisher,
          sourceUrl,
          externalId,
          title,
          summary,
          publishedAt: publishedAt ? new Date(publishedAt) : null,
          checksum,
          rawPayload: rawPayload ?? {},
          normalizedText,
          tagsJson: tagsJson ?? [],
        })
        .returning();

      res.status(201).json(created);
    } catch (err: any) {
      next(err);
    }
  });

  router.get("/source-documents", async (_req, res, next) => {
    try {
      const rows = await policyIntelDb.select().from(sourceDocuments).orderBy(desc(sourceDocuments.id));
      res.json(rows);
    } catch (err: any) {
      next(err);
    }
  });

  router.post("/alerts", async (req, res, next) => {
    try {
      const {
        workspaceId,
        watchlistId,
        sourceDocumentId,
        title,
        summary,
        // Accept friendly input names; map to actual schema columns below
        severity = "info",
        status = "pending_review",
        alertReason,
        metadataJson,
      } = req.body ?? {};

      if (!workspaceId || !watchlistId || !sourceDocumentId || !title) {
        return res.status(400).json({
          message: "workspaceId, watchlistId, sourceDocumentId, and title are required",
        });
      }

      // Map severity string → relevanceScore integer
      const severityScoreMap: Record<string, number> = {
        high: 80, medium: 50, low: 20, info: 0,
      };
      const relevanceScore = severityScoreMap[severity as string] ?? 0;

      // status must be a valid alertStatusEnum value
      const validStatuses = ["pending_review", "ready", "sent", "suppressed"] as const;
      type AlertStatus = typeof validStatuses[number];
      const resolvedStatus: AlertStatus = validStatuses.includes(status as AlertStatus)
        ? (status as AlertStatus)
        : "pending_review";

      const [created] = await policyIntelDb
        .insert(alerts)
        .values({
          workspaceId: Number(workspaceId),
          watchlistId: Number(watchlistId),
          sourceDocumentId: Number(sourceDocumentId),
          title,
          summary,
          whyItMatters: alertReason ?? null,
          status: resolvedStatus,
          relevanceScore,
          reasonsJson: metadataJson ? [JSON.stringify(metadataJson)] : [],
        })
        .returning();

      res.status(201).json(created);
    } catch (err: any) {
      next(err);
    }
  });

  router.get("/alerts", async (_req, res, next) => {
    try {
      const rows = await policyIntelDb.select().from(alerts).orderBy(desc(alerts.id));
      res.json(rows);
    } catch (err: any) {
      next(err);
    }
  });

  router.get("/briefs", async (_req, res, next) => {
    try {
      const rows = await policyIntelDb.select().from(briefs).orderBy(desc(briefs.id));
      res.json(rows);
    } catch (err: any) {
      next(err);
    }
  });

  router.get("/jobs", async (_req, res, next) => {
    try {
      const rows = await policyIntelDb.select().from(monitoringJobs).orderBy(desc(monitoringJobs.id));
      res.json(rows);
    } catch (err: any) {
      next(err);
    }
  });

  // ── Dev-only: seed Grace & McEwan workspace + watchlists ──────────────────
  router.post("/seed", async (_req, res, next) => {
    try {
      const result = await seedGraceMcEwan();
      res.status(200).json({
        message: "Grace & McEwan workspace seeded",
        workspaceId: result.workspace.id,
        watchlistIds: result.watchlistIds,
      });
    } catch (err: any) {
      next(err);
    }
  });

  // ── Job triggers ──────────────────────────────────────────────────────────

  router.post("/jobs/run-tlo-rss", async (_req, res, next) => {
    try {
      const result = await runTloRssJob();
      const status = result.feedErrors.length === result.feedsAttempted ? 500 : 200;
      res.status(status).json(result);
    } catch (err: any) {
      next(err);
    }
  });

  return router;
}
