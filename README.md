# ShotCoach AI Backend

Backend scaffold for migrating ShotCoach AI OpenAI calls from mobile client to a Sites-compatible deployment flow.

## Recommended stack

- Next.js App Router on vinext for Sites-compatible Cloudflare Worker output
- TypeScript
- OpenAI official SDK
- Zod for request validation

## Why this stack

- Produces the `dist/server/index.js` output that the Sites connector requires
- Preserves the existing App Router API surface while moving deployment to the Sites flow
- Keeps the backend deployable without relying on local Vercel CLI auth

## Endpoints

- `POST /api/v1/coach/analyze`
- `POST /api/v1/coach/direct-edit`
- `POST /api/v1/images/edit`
- `POST /api/v1/tools/edit`
- `POST /api/v1/recipes/apply`

## Security

- All production API routes now expect `Authorization: Bearer <firebase-id-token>`.
- All production API routes now expect `X-Firebase-AppCheck: <app-check-token>`.
- Firebase Admin credentials must be configured via `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`, or via application default credentials.
- Basic in-memory rate limiting is enabled per `route + uid + ip`.

## Mobile integration

- Detailed mobile integration doc: [docs/mobile-integration.md](./docs/mobile-integration.md)

## Coach reference pipeline

`POST /api/v1/coach/direct-edit` now runs a structured capture-plan flow:

```text
camera image -> photography analysis -> deterministic image prompt -> reference render -> visual QC -> optional single targeted retry
```

The response keeps the legacy coach fields and additionally exposes `coachResult.capture_plan`, `visualQcInitial`, `visualQcFinal`, `visualQcRetryCount`, `visualQcError`, `renderMode`, and `fallbackReason`. Configure the judge and retry policy with the `OPENAI_COACH_VISUAL_QC_*` variables in `.env.example`.

## Prompt mapping included

- Coach Vision Analysis V2
- Coach Directions V2
- Vision Analysis V1
- Creative Directions V1
- Prompt Composer V1
- Quality Evaluation
- Dynamic Coach V2 image edit prompt
- Direct Coach per-mode prompts
- Editing tool prompt mapping
- Conservative image edit wrapper

## Sites migration notes

- `.openai/hosting.json` is now present so the repo can participate in the Sites flow.
- `npm run build` is expected to emit `dist/server/index.js` for packaging by the Sites connector.
- Current requests still accept `imageBase64` for speed of implementation.
- `POST /api/v1/coach/analyze` returns the `AnalysisResult` shape described in the spec.
