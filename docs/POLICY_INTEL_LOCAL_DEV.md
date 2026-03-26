# ActUp Policy Intel Local Development

This repo is too large and too coupled to run the whole legacy app cleanly for the new policy-intel product. The fastest path is to develop the new bounded context in isolation while keeping the legacy code available for reference.

## Recommended tools

- Docker Desktop
- VS Code
- VS Code Dev Containers extension
- GitHub Desktop or Git CLI
- Optional: DBeaver or use Adminer at http://localhost:8080

## First-time setup

1. Optional: copy `.env.policy-intel.example` to `.env` if you want to override defaults or add API keys
2. Start the local stack:

```bash
docker compose -f docker-compose.policy-intel.yml up --build
```

3. In another terminal, push the policy-intel schema:

```bash
docker compose -f docker-compose.policy-intel.yml exec policy-intel npm run db:push:policy-intel
```

4. Open:
   - API health: http://localhost:5050/health
   - Policy Intel API root: http://localhost:5050/api/intel
   - Adminer: http://localhost:8080

## VS Code devcontainer flow

1. Open the repo folder in VS Code.
2. Run `Dev Containers: Reopen in Container`.
3. After the container comes up, the post-create hook installs dependencies and pushes the schema.
4. Start the service from the VS Code terminal if needed:

```bash
npm run dev:policy-intel
```

## What is wired right now

- A dedicated `server/policy-intel/` service entrypoint
- A clean schema in `shared/schema-policy-intel.ts`
- Core tables for workspaces, watchlists, source documents, alerts, briefs, and jobs
- Basic API endpoints under `/api/intel/*`
- Grace & McEwan workspace + 3 starter watchlists (seed script)
- TLO RSS connector (`connectors/texas/tlo-rss.ts`) — fetches FiledBills, ScheduledHearings, BillHistory
- Checksum-based deduplication engine (`engine/checksum.ts` + `services/source-document-service.ts`)
- Manual job trigger: `POST /api/intel/jobs/run-tlo-rss`

## Seed the Grace & McEwan workspace

After the schema push, seed the firm workspace and its three starter watchlists:

```bash
curl -X POST http://localhost:5050/api/intel/seed
```

Expected response:
```json
{
  "message": "Grace & McEwan workspace seeded",
  "workspaceId": 1,
  "watchlistIds": [1, 2, 3]
}
```

Verify:
```bash
curl http://localhost:5050/api/intel/watchlists
```

## Run the TLO RSS ingest job

Manually trigger the Texas Legislature Online RSS connector:

```bash
curl -X POST http://localhost:5050/api/intel/jobs/run-tlo-rss
```

Expected response (shape):
```json
{
  "feedsAttempted": 3,
  "feedErrors": [],
  "totalFetched": 45,
  "inserted": 45,
  "skipped": 0,
  "errors": []
}
```

Run it a second time — `inserted` should be 0 and `skipped` should match the previous `inserted` count
(checksum deduplication is working correctly).

## What to build next

- [x] Seed Grace & McEwan workspace + watchlists
- [x] TLO RSS connector (FiledBills, ScheduledHearings, BillHistory)
- [x] Checksum deduplication engine
- [ ] Phase 2: watchlist matching engine + alert generation
- [ ] Phase 3: matters + activities schema
- [ ] Phase 4: brief generation (Anthropic Claude, evidence-backed)
- [ ] Phase 5: stakeholder intelligence (TEC connector)
- [ ] Phase 6: Houston/Harris County/METRO local overlay
- [ ] Phase 7: decision kernel hardening + reviewer feedback loop
- [ ] Phase 8: minimal internal React UI

## Suggested first story

Build one full pipeline for **Texas legislative RSS/TLO updates**:

1. fetch source item
2. store in `policy_intel_source_documents`
3. match against a watchlist
4. create `policy_intel_alerts`
5. review in a minimal dashboard

## Notes

- The legacy app currently imports many routes and initializes optional AI clients at module load time. That makes a full local boot brittle.
- This isolated service avoids that problem and gives you a clean path to the commercial product.
