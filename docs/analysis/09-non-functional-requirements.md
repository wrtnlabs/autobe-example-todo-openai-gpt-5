# Non-Functional Requirements — todoMvp (MVP)

## 1. Principles and Measurement
- Purpose: business-level, measurable expectations that shape the minimal Todo MVP experience without prescribing technology or APIs.
- Philosophy: reliability over feature breadth; minimalistic scope; transparent feedback to users; privacy-first handling of personal data.
- Measurement: targets stated as P50/P95/Hard Ceiling where applicable; verification procedures stated in Acceptance.

THE todoMvp SHALL provide a stable, predictable experience for core features (authenticate, create, list, update, complete/uncomplete, delete) under Normal and Peak Loads as defined below.

## 2. Performance and Responsiveness

### 2.1 Load Profiles and Data Shapes
- Normal Load: up to 100 concurrently active authenticated users; up to 5 operations per user per minute across core features.
- Peak Load: short bursts up to 200 concurrently active authenticated users for up to 10 minutes.
- Standard List Size: up to 200 Todos per user; test targets assume up to 100 items per list view; larger lists should degrade gracefully.
- Operation Types: Create Todo; Read/List Todos; Update fields (title, notes, due, status); Complete/Uncomplete; Delete; Authentication (login, sign out).

### 2.2 Targets by Operation (User-Perceived)
- Create Todo (title plus optional notes/due): P50 ≤ 300 ms; P95 ≤ 800 ms; Hard Ceiling ≤ 2,000 ms.
- Read/List Todos (up to 100 items): P50 ≤ 200 ms; P95 ≤ 600 ms; Hard Ceiling ≤ 1,500 ms.
- Update Todo (title/notes/due/status): P50 ≤ 250 ms; P95 ≤ 700 ms; Hard Ceiling ≤ 2,000 ms.
- Complete/Uncomplete: P50 ≤ 200 ms; P95 ≤ 600 ms; Hard Ceiling ≤ 1,500 ms.
- Delete Todo: P50 ≤ 250 ms; P95 ≤ 700 ms; Hard Ceiling ≤ 2,000 ms.
- Authentication (login): P50 ≤ 400 ms; P95 ≤ 1,000 ms; Hard Ceiling ≤ 2,500 ms.

EARS requirements (performance):
- THE todoMvp SHALL complete Create Todo within P95 800 ms under Normal Load.
- THE todoMvp SHALL present Read/List of up to 100 items within P95 600 ms under Normal Load.
- THE todoMvp SHALL complete Update and Delete within P95 700 ms under Normal Load.
- WHEN a user toggles completion under Normal Load, THE todoMvp SHALL present the outcome within P95 600 ms.
- IF any operation exceeds its Hard Ceiling, THEN THE todoMvp SHALL provide a clear outcome or follow recovery guidance in Error Handling and Recovery.
- WHERE list size exceeds 100 items, THE todoMvp SHALL degrade gracefully by delivering a smaller subset first and providing a way to access remaining items.

### 2.3 Performance Budget (Conceptual)
```mermaid
graph LR
  A["User Action"] --> B["Request Received"]
  B -->|"<=50ms"| C["Authenticate User"]
  C -->|"<=100ms"| D["Authorize Action"]
  D -->|"<=300ms"| E["Process Todo Operation"]
  E -->|"<=200ms"| F["Persist and Confirm"]
  F -->|"<=50ms"| G["Prepare Response"]
  G -->|"Total<=1000ms(P95)"| H["Send Outcome"]
```

EARS requirements (budget and feedback):
- THE todoMvp SHALL provide outcomes for standard operations within 2,000 ms Hard Ceiling.
- WHILE processing exceeds 800 ms but does not exceed the Hard Ceiling, THE todoMvp SHALL provide a non-technical waiting indication and preserve user input where feasible.

### 2.4 Degradation, Backoff, and Idempotency
- Prioritization: critical operations (create, update status, delete) take precedence over large list retrieval during Peak Load.
- Idempotency: repeated identical submissions within 2 seconds must not create duplicates or apply duplicate mutations.
- Backoff: excessive repeated actions should be slowed with clear guidance; see Rate Limiting in Error Handling and Recovery.

EARS requirements (degradation):
- IF Peak Load occurs, THEN THE todoMvp SHALL maintain P95 targets for critical operations by deprioritizing non-critical operations such as large list retrieval.
- IF repeated identical requests for the same change are received within 2 seconds, THEN THE todoMvp SHALL treat them idempotently.

## 3. Availability and Reliability

### 3.1 Uptime and Maintenance (Asia/Seoul)
- Availability Target: 99.5% per calendar month for core features.
- Planned Maintenance: scheduled with at least 24 hours notice, performed during low-traffic hours 02:00–05:00 KST, limited to ≤ 2 hours per week.
- Incident Communications: initial status update within 30 minutes of an outage; subsequent updates at least every 60 minutes until resolution.

EARS requirements (availability):
- THE todoMvp SHALL achieve ≥ 99.5% monthly availability for core features.
- WHERE maintenance is required, THE todoMvp SHALL notify at least 24 hours in advance and aim for 02:00–05:00 KST windows.
- WHEN an outage occurs, THE todoMvp SHALL publish an initial status update within 30 minutes and subsequent updates at least hourly until resolved.

### 3.2 Recovery and Consistency
- Restoration Objective: core functionality restored within 60 minutes after a service-wide incident under normal recovery conditions.
- Read-Only Mode: if partial data unavailability occurs, provide read-only list access within 30 minutes while full write capabilities are restored.
- Durability: a confirmed success implies durable storage.
- Read-After-Write: reads reflect confirmed writes within 1 second under Normal Load.

EARS requirements (recovery):
- WHEN an incident occurs, THE todoMvp SHALL restore core features within 60 minutes where feasible under normal recovery conditions.
- IF partial unavailability occurs, THEN THE todoMvp SHALL provide read-only access to personal Todo lists within 30 minutes while writes are restored.
- WHEN a save is confirmed, THE todoMvp SHALL ensure the change persists and is reflected by subsequent reads within 1 second under Normal Load.

## 4. Resilience and Scalability

### 4.1 Burst Handling and Fairness
- Fair Use: per-account limits keep the system usable for all during spikes.
- Queueing/Backpressure (business-level): slow down non-critical actions when spikes occur to keep critical actions responsive.

EARS requirements (burst handling):
- WHERE unusual spikes occur, THE todoMvp SHALL apply fair-use limits per account to preserve responsiveness for all users.
- IF non-critical operations threaten responsiveness, THEN THE todoMvp SHALL delay them to prioritize critical operations.

### 4.2 Dependency Degradation
- External or internal dependency slowness must not block all user interactions.

EARS requirements (graceful degradation):
- IF a dependency becomes slow or unavailable, THEN THE todoMvp SHALL continue to serve core operations where safe and provide clear feedback when an action cannot proceed.

### 4.3 Duplicate Submissions and Conflicts
- Duplicate Processing: safe to retry; no duplicate Todos or double mutations.
- Conflict Awareness: concurrent edits reported with clear retry guidance.

EARS requirements (idempotency/conflict):
- IF duplicate submissions are received for the same operation, THEN THE todoMvp SHALL ensure a single resulting change.
- WHEN a concurrency conflict is detected, THE todoMvp SHALL reject the operation and advise the user to refresh and re-apply changes.

## 5. Security and Privacy

### 5.1 Authentication and Session (Business-Level)
- Authentication required for any access to personal Todos.
- Session Timeout: end authenticated sessions after 30 minutes of inactivity by default.
- Persistent Sessions (policy-bound): up to 14 days unless explicitly revoked by the user.
- Lockout: 5 consecutive authentication failures within 10 minutes cause a 10-minute cooldown with recovery guidance.

EARS requirements (auth/session):
- THE todoMvp SHALL require authentication for all Todo operations.
- WHILE a session remains inactive for 30 minutes, THE todoMvp SHALL end the session and require re-authentication.
- WHERE persistent sessions are enabled by policy, THE todoMvp SHALL allow up to 14 days of continuity unless revoked.
- IF 5 consecutive login failures occur within 10 minutes, THEN THE todoMvp SHALL apply a 10-minute cooldown and present recovery steps.

### 5.2 Authorization Boundaries (Role-Based)
- Guest: no access to Todo data.
- User: can act only on own Todos.
- Admin: restricted to minimal oversight; no routine visibility into Todo content in MVP.

EARS requirements (authorization):
- THE todoMvp SHALL enforce that users access and manage only their own Todos.
- IF a guest attempts to access Todo data, THEN THE todoMvp SHALL deny the action and guide to sign in.
- WHERE administrative oversight is necessary, THE todoMvp SHALL restrict actions to the minimum necessary and avoid exposing Todo content in MVP.

### 5.3 Data Protection and Logging Constraints
- Data Minimization: collect only what is necessary for service operation.
- Secrets Handling: credentials never displayed or transmitted in readable form.
- Logging Constraints: no sensitive content such as passwords or full Todo text in logs; use opaque correlation identifiers.
- Log Retention: operational logs retained for up to 90 days for diagnostics.

EARS requirements (protection):
- THE todoMvp SHALL avoid logging sensitive content and SHALL use opaque identifiers for diagnostics.
- WHERE logs are retained, THE todoMvp SHALL limit retention to 90 days for operational purposes unless policy requires longer.

## 6. Usability and Accessibility

### 6.1 Perceptual Responsiveness and Feedback
- Clear outcomes for every operation within Hard Ceilings.
- Immediate reflection of successful changes without manual refresh.
- Preservation of inputs during delays.

EARS requirements (responsiveness):
- THE todoMvp SHALL present a success or failure outcome for every operation within its Hard Ceiling.
- WHEN an operation succeeds, THE todoMvp SHALL make the result visible without requiring manual refresh.
- IF processing exceeds 800 ms, THEN THE todoMvp SHALL present a non-technical waiting indication and retain user input where feasible.

### 6.2 Accessibility Expectations
- Keyboard-only completion of core tasks is supported.
- Text-based feedback suitable for assistive technologies.
- Plain-language messaging; no internal codes surfaced to users.

EARS requirements (accessibility):
- THE todoMvp SHALL allow sign-in and all core Todo operations via keyboard-only interactions.
- THE todoMvp SHALL provide text-based status messages compatible with assistive technologies.
- THE todoMvp SHALL use plain language in user-visible messages and avoid exposing internal technical identifiers.

## 7. Operability and Observability

### 7.1 Monitoring and Alerting (Business Language)
- Service health must be monitored with clear business-level indicators for core features (auth and Todo CRUD) and dependency health.

EARS requirements (monitoring):
- THE todoMvp SHALL monitor core feature success rates and latencies against the targets stated herein.
- WHEN a material deviation from targets occurs, THE todoMvp SHALL trigger operational alerts and begin recovery procedures.

### 7.2 Change Management and Rollbacks
- Releases should protect availability and allow quick rollback if issues arise.

EARS requirements (change):
- WHEN a release introduces material regressions to P95 targets or availability, THE todoMvp SHALL rollback to the prior stable state.
- WHERE change windows are scheduled, THE todoMvp SHALL align rollouts with maintenance windows described in Availability.

### 7.3 Status Communications
- Transparent, timely updates during incidents.

EARS requirements (communications):
- WHEN a user-facing incident occurs, THE todoMvp SHALL publish and maintain a status channel with updates at least every 60 minutes until resolution.

## 8. Compliance and Regional Considerations

### 8.1 Privacy Notice and Data Rights
- Publish a concise privacy notice describing minimal personal data collection, purposes, and deletion request process.
- Account Deletion: remove or irreversibly anonymize personal data and Todos within 30 days, except where retention is legally required.
- Backups: ensure deleted personal data is not restored to active systems after deletion completes.
- Data Export (if offered in MVP or later): user-initiated export provided within 14 days.

EARS requirements (privacy/data rights):
- THE todoMvp SHALL publish a concise privacy notice covering collection, purpose, and deletion requests.
- WHEN a user requests account deletion, THE todoMvp SHALL remove or irreversibly anonymize personal data and Todos within 30 days, except where legally required to retain.
- WHERE backups exist, THE todoMvp SHALL prevent restoration of deleted personal data to active systems once deletion completes.
- WHEN a user requests a copy of their personal data, THE todoMvp SHALL provide an export within 14 days.

### 8.2 Time and Locale Consistency (Asia/Seoul Primary)
- Date/time shown and interpreted consistently in the user’s local context; Asia/Seoul is the primary reference for scheduling communications and maintenance windows.

EARS requirements (time/locale):
- THE todoMvp SHALL display and interpret dates and times in the user’s local context and use KST for service-wide scheduling.

## 9. Verification and Acceptance

### 9.1 Validation Approach
- Performance Validation: execute test scenarios representing Normal and Peak Load; confirm P50/P95 and Hard Ceilings per section 2.2.
- Availability Validation: review monthly uptime logs; confirm maintenance notices issued per 3.1.
- Recovery Validation: simulate incidents; confirm restoration within 60 minutes and read-only mode within 30 minutes when partial.
- Durability/Consistency: verify that confirmed writes persist and are visible within 1 second.
- Security/Privacy: validate session timeouts, lockout behavior, role-based access enforcement, minimal logging of sensitive data, and privacy notice presence.
- Accessibility: verify keyboard-only flows and text-based status messages for core tasks.

### 9.2 EARS Acceptance Summary
- THE todoMvp SHALL meet or exceed P95 targets in section 2.2 under Normal Load.
- WHEN Peak Load occurs, THE todoMvp SHALL maintain P95 targets for critical operations and degrade non-critical ones gracefully.
- IF service incidents occur, THEN THE todoMvp SHALL meet restoration objectives stated in section 3.2.
- THE todoMvp SHALL enforce role-based access boundaries and session rules stated in sections 5.1–5.2.
- WHERE users exercise data rights, THE todoMvp SHALL fulfill requests within the timeframes in section 8.1.

## 10. Related References and Glossary

Related references (business-level):
- Vision and goals: Service Overview for the Todo MVP — [Service Overview and Requirements Analysis (MVP)](./01-service-overview.md)
- Roles and access boundaries: [User Roles and Permissions Requirements for todoMvp](./03-user-roles-and-permissions.md)
- Failure handling and recovery: [Error Handling and Recovery (Business-Level)](./08-error-handling-and-recovery.md)

Glossary:
- Core Features: authentication and Todo CRUD operations (Create, Read/List, Update, Complete/Uncomplete, Delete).
- Normal Load / Peak Load: concurrency and rate envelopes defined in section 2.1.
- P50/P95: 50th and 95th percentile of end-to-end completion time from request receipt to outcome.
- Hard Ceiling: maximum acceptable duration before a definitive outcome or recovery guidance is required.
- Durable: confirmed changes remain available after success is shown to the user.
- Read-After-Write: the expectation that subsequent reads reflect confirmed writes rapidly (≤ 1 second under Normal Load).
