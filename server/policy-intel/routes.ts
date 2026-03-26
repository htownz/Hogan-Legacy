import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { policyIntelDb } from "./db";
import { activities, alerts, briefs, deliverables, matters, matterWatchlists, monitoringJobs, sourceDocuments, watchlists, workspaces } from "@shared/schema-policy-intel";
import { seedGraceMcEwan } from "./seed/grace-mcewan";
import { runTloRssJob } from "./jobs/run-tlo-rss";
import { processDocumentAlerts } from "./services/alert-service";
import { generateBrief } from "./services/brief-service";

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
        "/api/intel/briefs/generate",
        "/api/intel/deliverables",
        "/api/intel/matters",
        "/api/intel/activities",
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

  router.post("/briefs/generate", async (req, res, next) => {
    try {
      const { workspaceId, watchlistId, matterId, sourceDocumentIds, title } = req.body ?? {};
      if (!workspaceId || !sourceDocumentIds || !Array.isArray(sourceDocumentIds) || sourceDocumentIds.length === 0) {
        return res.status(400).json({ message: "workspaceId and non-empty sourceDocumentIds[] are required — no sources, no brief" });
      }
      const result = await generateBrief({
        workspaceId: Number(workspaceId),
        watchlistId: watchlistId ? Number(watchlistId) : undefined,
        matterId: matterId ? Number(matterId) : undefined,
        sourceDocumentIds: sourceDocumentIds.map(Number),
        title,
      });
      res.status(201).json(result);
    } catch (err: any) {
      next(err);
    }
  });

  router.get("/deliverables", async (_req, res, next) => {
    try {
      const rows = await policyIntelDb.select().from(deliverables).orderBy(desc(deliverables.id));
      res.json(rows);
    } catch (err: any) {
      next(err);
    }
  });

  // Briefs for a specific matter (via deliverables)
  router.get("/matters/:id/briefs", async (req, res, next) => {
    try {
      const matterId = Number(req.params.id);
      const rows = await policyIntelDb
        .select()
        .from(deliverables)
        .where(eq(deliverables.matterId, matterId))
        .orderBy(desc(deliverables.id));
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

  // ── Matters ────────────────────────────────────────────────────────────────

  router.get("/matters", async (_req, res, next) => {
    try {
      const rows = await policyIntelDb.select().from(matters).orderBy(desc(matters.id));
      res.json(rows);
    } catch (err: any) {
      next(err);
    }
  });

  router.post("/matters", async (req, res, next) => {
    try {
      const { workspaceId, slug, name, clientName, practiceArea, jurisdictionScope, status, ownerUserId, description, tagsJson } = req.body ?? {};
      if (!workspaceId || !slug || !name) {
        return res.status(400).json({ message: "workspaceId, slug, and name are required" });
      }
      const [created] = await policyIntelDb
        .insert(matters)
        .values({
          workspaceId: Number(workspaceId),
          slug,
          name,
          clientName,
          practiceArea,
          jurisdictionScope: jurisdictionScope ?? "texas",
          status: status ?? "active",
          ownerUserId: ownerUserId ? Number(ownerUserId) : null,
          description,
          tagsJson: tagsJson ?? [],
        })
        .returning();
      res.status(201).json(created);
    } catch (err: any) {
      next(err);
    }
  });

  router.get("/matters/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const [matter] = await policyIntelDb.select().from(matters).where(eq(matters.id, id));
      if (!matter) return res.status(404).json({ message: "matter not found" });
      res.json(matter);
    } catch (err: any) {
      next(err);
    }
  });

  // Link a watchlist to a matter
  router.post("/matters/:id/watchlists", async (req, res, next) => {
    try {
      const matterId = Number(req.params.id);
      const { watchlistId } = req.body ?? {};
      if (!watchlistId) {
        return res.status(400).json({ message: "watchlistId is required" });
      }
      const [created] = await policyIntelDb
        .insert(matterWatchlists)
        .values({ matterId, watchlistId: Number(watchlistId) })
        .returning();
      res.status(201).json(created);
    } catch (err: any) {
      next(err);
    }
  });

  // Get watchlists linked to a matter
  router.get("/matters/:id/watchlists", async (req, res, next) => {
    try {
      const matterId = Number(req.params.id);
      const links = await policyIntelDb.select().from(matterWatchlists).where(eq(matterWatchlists.matterId, matterId));
      if (links.length === 0) return res.json([]);
      const wlIds = links.map((l) => l.watchlistId);
      const rows = await policyIntelDb.select().from(watchlists).where(inArray(watchlists.id, wlIds));
      res.json(rows);
    } catch (err: any) {
      next(err);
    }
  });

  // Get alerts for a matter (via its linked watchlists)
  router.get("/matters/:id/alerts", async (req, res, next) => {
    try {
      const matterId = Number(req.params.id);
      const links = await policyIntelDb.select().from(matterWatchlists).where(eq(matterWatchlists.matterId, matterId));
      if (links.length === 0) return res.json([]);
      const wlIds = links.map((l) => l.watchlistId);
      const rows = await policyIntelDb
        .select()
        .from(alerts)
        .where(inArray(alerts.watchlistId, wlIds))
        .orderBy(desc(alerts.id));
      res.json(rows);
    } catch (err: any) {
      next(err);
    }
  });

  // ── Activities ────────────────────────────────────────────────────────────

  router.post("/matters/:id/activities", async (req, res, next) => {
    try {
      const matterId = Number(req.params.id);
      const { workspaceId, alertId, type, ownerUserId, summary, detailText, dueAt } = req.body ?? {};
      if (!workspaceId || !type || !summary) {
        return res.status(400).json({ message: "workspaceId, type, and summary are required" });
      }
      const [created] = await policyIntelDb
        .insert(activities)
        .values({
          workspaceId: Number(workspaceId),
          matterId,
          alertId: alertId ? Number(alertId) : null,
          type,
          ownerUserId: ownerUserId ? Number(ownerUserId) : null,
          summary,
          detailText,
          dueAt: dueAt ? new Date(dueAt) : null,
        })
        .returning();
      res.status(201).json(created);
    } catch (err: any) {
      next(err);
    }
  });

  router.get("/matters/:id/activities", async (req, res, next) => {
    try {
      const matterId = Number(req.params.id);
      const rows = await policyIntelDb
        .select()
        .from(activities)
        .where(eq(activities.matterId, matterId))
        .orderBy(desc(activities.id));
      res.json(rows);
    } catch (err: any) {
      next(err);
    }
  });

  router.get("/activities", async (_req, res, next) => {
    try {
      const rows = await policyIntelDb.select().from(activities).orderBy(desc(activities.id));
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
        matterIds: result.matterIds,
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

  router.post("/jobs/match-existing", async (_req, res, next) => {
    try {
      const allDocs = await policyIntelDb.select().from(sourceDocuments);
      const allWorkspaces = await policyIntelDb.select({ id: workspaces.id }).from(workspaces);

      const totals = { created: 0, skippedDuplicate: 0, skippedCooldown: 0, details: [] as { alertId: number; watchlist: string; score: number }[] };

      for (const doc of allDocs) {
        for (const ws of allWorkspaces) {
          const r = await processDocumentAlerts(doc, ws.id);
          totals.created += r.created;
          totals.skippedDuplicate += r.skippedDuplicate;
          totals.skippedCooldown += r.skippedCooldown;
          totals.details.push(...r.details);
        }
      }

      res.json({ docsProcessed: allDocs.length, workspaces: allWorkspaces.length, alerts: totals });
    } catch (err: any) {
      next(err);
    }
  });

  return router;
}
