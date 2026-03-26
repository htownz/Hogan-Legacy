import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const sourceTypeEnum = pgEnum("policy_intel_source_type", [
  "federal_legislation",
  "federal_regulation",
  "federal_lobbying",
  "federal_nonprofit",
  "texas_legislation",
  "texas_regulation",
  "texas_ethics",
  "manual",
]);

export const alertStatusEnum = pgEnum("policy_intel_alert_status", [
  "pending_review",
  "ready",
  "sent",
  "suppressed",
]);

export const briefStatusEnum = pgEnum("policy_intel_brief_status", [
  "draft",
  "review",
  "published",
]);

export const deliverableTypeEnum = pgEnum("policy_intel_deliverable_type", [
  "issue_brief",
  "hearing_memo",
  "client_alert",
  "weekly_digest",
]);

export const matterStatusEnum = pgEnum("policy_intel_matter_status", [
  "active",
  "watching",
  "closed",
  "archived",
]);

export const activityTypeEnum = pgEnum("policy_intel_activity_type", [
  "alert_received",
  "brief_drafted",
  "note_added",
  "task_assigned",
  "status_changed",
  "document_linked",
  "review_completed",
]);

export const workspaces = pgTable("policy_intel_workspaces", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  jurisdictionScope: varchar("jurisdiction_scope", { length: 64 })
    .notNull()
    .default("us_federal_texas"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const watchlists = pgTable(
  "policy_intel_watchlists",
  {
    id: serial("id").primaryKey(),
    workspaceId: integer("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    topic: varchar("topic", { length: 255 }),
    isActive: boolean("is_active").notNull().default(true),
    rulesJson: jsonb("rules_json").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceNameUnique: uniqueIndex("policy_intel_watchlists_workspace_name_idx").on(
      table.workspaceId,
      table.name,
    ),
  }),
);

export const sourceDocuments = pgTable("policy_intel_source_documents", {
  id: serial("id").primaryKey(),
  sourceType: sourceTypeEnum("source_type").notNull(),
  publisher: varchar("publisher", { length: 255 }).notNull(),
  sourceUrl: text("source_url").notNull(),
  externalId: varchar("external_id", { length: 255 }),
  title: text("title").notNull(),
  summary: text("summary"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  checksum: varchar("checksum", { length: 128 }),
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull().default({}),
  normalizedText: text("normalized_text"),
  tagsJson: jsonb("tags_json").$type<string[]>().notNull().default([]),
});

export const alerts = pgTable("policy_intel_alerts", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  watchlistId: integer("watchlist_id").references(() => watchlists.id, { onDelete: "set null" }),
  sourceDocumentId: integer("source_document_id").references(() => sourceDocuments.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  summary: text("summary"),
  whyItMatters: text("why_it_matters"),
  status: alertStatusEnum("status").notNull().default("pending_review"),
  relevanceScore: integer("relevance_score").notNull().default(0),
  reasonsJson: jsonb("reasons_json").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const briefs = pgTable("policy_intel_briefs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  watchlistId: integer("watchlist_id").references(() => watchlists.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  status: briefStatusEnum("status").notNull().default("draft"),
  briefText: text("brief_text"),
  sourcePackJson: jsonb("source_pack_json").$type<Record<string, unknown>[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const monitoringJobs = pgTable("policy_intel_monitoring_jobs", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  jobType: varchar("job_type", { length: 128 }).notNull(),
  sourceType: sourceTypeEnum("source_type").notNull(),
  schedule: varchar("schedule", { length: 64 }).notNull().default("manual"),
  enabled: boolean("enabled").notNull().default(true),
  configJson: jsonb("config_json").$type<Record<string, unknown>>().notNull().default({}),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Phase 3: Matters + Activities ───────────────────────────────────────────

export const matters = pgTable("policy_intel_matters", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  slug: varchar("slug", { length: 150 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  clientName: varchar("client_name", { length: 255 }),
  practiceArea: varchar("practice_area", { length: 128 }),
  jurisdictionScope: varchar("jurisdiction_scope", { length: 64 }).notNull().default("texas"),
  status: matterStatusEnum("status").notNull().default("active"),
  ownerUserId: integer("owner_user_id"),
  description: text("description"),
  tagsJson: jsonb("tags_json").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const matterWatchlists = pgTable(
  "policy_intel_matter_watchlists",
  {
    id: serial("id").primaryKey(),
    matterId: integer("matter_id").notNull().references(() => matters.id, { onDelete: "cascade" }),
    watchlistId: integer("watchlist_id").notNull().references(() => watchlists.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    matterWatchlistUnique: uniqueIndex("policy_intel_matter_watchlists_unique_idx").on(
      table.matterId,
      table.watchlistId,
    ),
  }),
);

export const activities = pgTable("policy_intel_activities", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  matterId: integer("matter_id").references(() => matters.id, { onDelete: "cascade" }),
  alertId: integer("alert_id").references(() => alerts.id, { onDelete: "set null" }),
  type: activityTypeEnum("type").notNull(),
  ownerUserId: integer("owner_user_id"),
  summary: text("summary").notNull(),
  detailText: text("detail_text"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ── Phase 4: Deliverables ───────────────────────────────────────────────────

export const deliverables = pgTable("policy_intel_deliverables", {
  id: serial("id").primaryKey(),
  workspaceId: integer("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  briefId: integer("brief_id").references(() => briefs.id, { onDelete: "set null" }),
  matterId: integer("matter_id").references(() => matters.id, { onDelete: "set null" }),
  type: deliverableTypeEnum("type").notNull().default("issue_brief"),
  title: text("title").notNull(),
  bodyMarkdown: text("body_markdown").notNull(),
  sourceDocumentIds: jsonb("source_document_ids").$type<number[]>().notNull().default([]),
  citationsJson: jsonb("citations_json").$type<Record<string, unknown>[]>().notNull().default([]),
  generatedBy: varchar("generated_by", { length: 64 }).notNull().default("template"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PolicyIntelWorkspace = typeof workspaces.$inferSelect;
export type InsertPolicyIntelWorkspace = typeof workspaces.$inferInsert;
export type PolicyIntelWatchlist = typeof watchlists.$inferSelect;
export type InsertPolicyIntelWatchlist = typeof watchlists.$inferInsert;
export type PolicyIntelSourceDocument = typeof sourceDocuments.$inferSelect;
export type InsertPolicyIntelSourceDocument = typeof sourceDocuments.$inferInsert;
export type PolicyIntelAlert = typeof alerts.$inferSelect;
export type InsertPolicyIntelAlert = typeof alerts.$inferInsert;
export type PolicyIntelBrief = typeof briefs.$inferSelect;
export type InsertPolicyIntelBrief = typeof briefs.$inferInsert;
export type PolicyIntelMonitoringJob = typeof monitoringJobs.$inferSelect;
export type InsertPolicyIntelMonitoringJob = typeof monitoringJobs.$inferInsert;
export type PolicyIntelMatter = typeof matters.$inferSelect;
export type InsertPolicyIntelMatter = typeof matters.$inferInsert;
export type PolicyIntelMatterWatchlist = typeof matterWatchlists.$inferSelect;
export type InsertPolicyIntelMatterWatchlist = typeof matterWatchlists.$inferInsert;
export type PolicyIntelActivity = typeof activities.$inferSelect;
export type InsertPolicyIntelActivity = typeof activities.$inferInsert;
export type PolicyIntelDeliverable = typeof deliverables.$inferSelect;
export type InsertPolicyIntelDeliverable = typeof deliverables.$inferInsert;
