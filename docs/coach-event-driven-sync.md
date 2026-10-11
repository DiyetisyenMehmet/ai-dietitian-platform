# Coach event synchronization — APP6 P2 A1

Scope: development/staging only. This branch does not deploy or change cloud resources.

## Transport and consistency

The shared Web/Android WebView/Safari-WebKit client uses streaming `fetch` with the existing in-memory Authorization Bearer and HttpOnly refresh cookie. Native EventSource cannot supply that header. A bidirectional WebSocket and a new Redis/PubSub service are unnecessary for invalidation-only events.

Existing conversation/message writes remain authoritative. A per-user bigint revision is incremented in the same PostgreSQL transaction as creation, completed turn, rename, pin/unpin or deletion. After commit, a best-effort PostgreSQL NOTIFY carries only owner ID (internal routing), conversation ID, type and decimal revision. Each backend process has one lazy, dedicated LISTEN session, so writers and recipients may occupy different Cloud Run instances. The browser envelope excludes owner ID, message/title/health content and credentials.

NOTIFY is live delivery, not a durable queue. LISTEN is committed before reading the durable revision and emitting `ready`; notifications received during that handshake are buffered with a strict bound. Reconnection reconciles authoritative history if the revision differs. Duplicates and older revisions are ignored; gaps cause a snapshot. If publication fails, the saved message and normal response still succeed; the next revision gap or reconnect repairs missed data. A silent publication failure can therefore delay visible recovery until the bounded stream rotation (145 seconds plus reconnect delay). This is not guaranteed 1–2 second delivery under transport failure.

The coordinator serializes targeted summary/detail requests, waits for local reply/loading operations, and rejects old-account or pre-mutation responses. It does not select another conversation. Existing composer and near-bottom scroll behavior remain in place. Full list reads occur on entry/resume, changed reconnect revision, or detected gaps; healthy idle streams do not poll lists/details. Only an explicit server `COACH_SYNC_DISABLED` response selects the preserved P1 rollback interval. Authentication, capacity, network and configuration errors do not select polling.

## Lifecycle and authentication

The connection exists only while Coach is mounted, visible, online and authenticated. Unmount, pagehide, hidden document, offline, Android's trusted-origin `diewish:app-visibility` bridge, logout and account changes abort it. Resume/pageshow/online reconcile missed history. Safari/WebKit uses the same decoder (`getReader`, TextDecoder and AbortController); no platform-specific backend is required. A future native iOS client can consume the same authenticated endpoint, close it on native suspension and request canonical history on resume.

Streams expire no later than their access token or 145 seconds, below the existing backend 170-second and frontend proxy 175-second deadlines. Reconnect reuses the existing single-flight refresh mechanism. A 25-second comment heartbeat verifies token and active account; it never queries conversations. The client has a 10-second opening deadline, a 60-second silent-stream deadline and exponential retries (1, 2, 4, 8, 16, 30 seconds, with jitter). Payload/frame/queue sizes and response backpressure are bounded.

## Activation requires an integration decision

Default `COACH_SYNC_ENABLED=false` preserves the explicit P1 rollback. Enabling live mode needs all of the following on **staging**, after integration approval:

1. Apply `20261011220000_coach_sync_revision` using the existing migration workflow. Verify the runtime role's ordinary table DML privileges for the new table.
2. Configure `COACH_SYNC_DATABASE_URL` as a **direct connection to the same database, endpoint and runtime role** as DATABASE_URL. The transaction pooler cannot maintain LISTEN sessions. The application rejects a pooler listener, different host/database/role and production runtime. Do not mount or reuse the privileged migration credential.
3. Set `COACH_SYNC_ENABLED=true` and validate the actual frontend proxy, runtime role, Neon endpoint, Android and Safari/WebKit lifecycle on the approved staging deployment.
4. Measure concurrency, real device latency and the billing effect before expanding capacity. No cloud resource or deployment configuration has been changed by this branch.

Rollback: explicitly disable the flag; new streams receive the disabled response and use P1 polling only while Coach is active. Existing streams age out within 145 seconds. No message/history migration reversal is necessary.

## Resource model and limits

Previous fixed polling: approximately 720 full-list HTTP requests per idle Coach client-hour, plus authenticated user and conversation-list SQL reads and any active detail reads. Live mode: zero scheduled list/detail HTTP reads, one current HTTP stream/client, one dedicated PostgreSQL listener/backend process with subscribers, and one small durable revision row/user. Last-subscriber departure releases the database listener. Notifications fan out on the existing database to listeners; local memory only routes each process's authenticated subscribers.

At most 20 live streams/process reserve API headroom within the existing Cloud Run concurrency 40. Six streams/account/process are allowed. With the current backend max-instances 2, approximately 40 live streams is only a configured ceiling, **not measured scalable capacity or a globally enforced account limit**. Above capacity, history/send APIs remain independent and the live client backs off without silent polling.

Long HTTP streams keep frontend proxy and backend requests active and can prevent scale-to-zero while Coach remains open. Database LISTEN can also sustain existing compute activity. No new broker fee/resource is introduced, but incremental Cloud Run/Neon costs are not zero. Billing depends on live hours, instance sharing/concurrency, region, free allowance and database compute; platform load/billing validation remains an integration gate.

## Verification in the existing Hardening CI

Backend unit and real PostgreSQL integration suites include strict event schemas, safe publication failure, ownership/foreign access, rollback, expired Bearer, three separate Node processes, genuine listener process restart, and idle conversation read/CPU/memory instrumentation. No integration test is skipped or replaced with an in-memory database.

The existing frontend unit gate runs Coach store/coordinator and session recovery tests. The existing browser gate runs Chromium desktop, Chromium mobile and Playwright WebKit mobile together against three backend processes and a synthetic account. It covers all six browser-engine directions, idle reads, shared active history, unsent drafts, reading scroll position, rename/pin/delete, native bridge contract, pagehide/resume and history recovery. Test-only synthetic AI is installed only in the hermetic fixture; product quota/consent/persistence logic remains real.

Chromium mobile is not a real Android device. Playwright WebKit is not iOS Safari on hardware or iOS Simulator. The separate QA branch's iOS WKWebView shell points only to staging, and this feature is intentionally not deployed. Native suspension/lock/network/keyboard/safe-area acceptance must therefore be reported separately as NOT TESTED until approved staging integration. No new production native iOS application is claimed.
