---
description: "Task list for the collaborative wedding photo album"
---

# Tasks: Álbum colaborativo de fotos

**Input**: Design documents from `/specs/001-album-colaborativo/`

**Prerequisites**: `plan.md`, `spec.md`; design references: `research.md`, `data-model.md`, `contracts/`, `quickstart.md`.

**Tests**: No automated test tasks are included because the specification does not explicitly request a test-first workflow. Each story has independent manual/integration validation criteria.

**Organization**: Tasks grouped by user story for independently deliverable increments.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare project-specific Supabase configuration and deployment context.

- [ ] T001 [P] Record dedicated Supabase project provisioning, Auth redirect, allowed origins, and secret setup in `supabase/README.md`
- [ ] T002 [P] Configure the project URL and publishable key placeholders and document the event slug in `js/supabase-config.js`
- [ ] T003 Confirm the static Pages base path and relative page/resource links across `index.html`, `album.html`, `admin.html`, and `projection.html`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish event-scoped schema, authorization, storage boundaries, and server-side upload/moderation primitives required by all stories.

- [ ] T004 Define event, settings, membership, photo, lifecycle, and rate-limit schema with constraints and indexes in `supabase/migrations/001_album.sql`
- [ ] T005 [P] Enforce event-scoped RLS, role authorization, public-approved-only reads, and immutable guest writes in `supabase/migrations/001_album.sql`
- [ ] T006 [P] Create private inbox and approved-public buckets with read/write policies in `supabase/migrations/001_album.sql`
- [ ] T007 Implement project-origin CORS, JSON errors, Supabase client setup, and server-only service-role use in `supabase/functions/submit-photo/index.ts`
- [ ] T008 Implement JWT identity and event-membership authorization helpers for moderation and administrator management in `supabase/functions/moderate-photo/index.ts` and `supabase/functions/manage-admin/index.ts`
- [ ] T009 Document initial owner membership bootstrap and deploy commands for migration and Edge Functions in `supabase/README.md`

**Checkpoint**: Database and storage policies isolate event data; privileged operations remain server-side.

---

## Phase 3: User Story 1 - Compartir fotografías sin cuenta (Priority: P1) — MVP

**Goal**: A guest can select/capture, preview, remove, submit, and individually retry photos without login or personal information.

**Independent Test**: On iPhone Safari and Android Chrome in a signed-out session, open the album, select/take images, remove one preview, submit another without personal details, and retry one failed image without reselecting the rest.

### Implementation

- [ ] T010 [P] [US1] Build accessible camera and multi-file selection, preview list, and individual removal controls in `album.html`
- [ ] T011 [P] [US1] Implement client image decode/re-encode, size/count/MIME checks, and HEIC/HEIF guidance in `js/album.js`
- [ ] T012 [US1] Implement multipart guest upload with event slug and anonymous session, per-image progress/results, and isolated retries in `js/album.js`
- [ ] T013 [US1] Validate event state, batch count, file extension/MIME/signature/size/dimensions, and hashed IP/session rate limits in `supabase/functions/submit-photo/index.ts`
- [ ] T014 [US1] Store accepted files privately, create pending photo records, and return per-file outcomes from `supabase/functions/submit-photo/index.ts`
- [ ] T015 [US1] Publish automatically only after successful public-bucket upload when event settings select automatic mode in `supabase/functions/submit-photo/index.ts`
- [ ] T016 [US1] Add responsive upload/preview/error styles, visible focus, and reduced-motion handling in `css/album.css`

**Checkpoint**: Guest upload works anonymously on supported mobile browsers, with server-side validation and per-file retry.

---

## Phase 4: User Story 2 - Revisar y publicar fotografías (Priority: P1)

**Goal**: Authorized moderators/admins review pending photos; publication mode and role limits are enforced.

**Independent Test**: Create a pending photo in manual mode; verify it is not publicly readable, preview/review it as moderator, approve or reject it, and confirm moderator cannot delete or change settings; verify admin can delete and automatic mode publishes valid uploads.

### Implementation

- [ ] T017 [P] [US2] Build moderation queue, private preview display, status actions, and role-specific controls in `admin.html`
- [ ] T018 [US2] Implement authenticated pending-photo query and event-role capability rendering in `js/admin.js`
- [ ] T019 [US2] Implement approve/reject/delete/preview actions, state conflict handling, and event-scoped role checks in `supabase/functions/moderate-photo/index.ts`
- [ ] T020 [US2] Ensure approval writes approved storage before changing photo state, while rejection retains the record and removes inbox object, in `supabase/functions/moderate-photo/index.ts`
- [ ] T021 [US2] Verify only owner can change publication mode and only admin/owner can delete through `supabase/migrations/001_album.sql`
- [ ] T022 [US2] Display actionable moderation failures and current photo state in `js/admin.js`

**Checkpoint**: Pending items are private, moderation transitions are role-scoped, and automatic publication is safe.

---

## Phase 5: User Story 3 - Ver una galería que se actualiza en vivo (Priority: P1)

**Goal**: Guests see approved photos only; gallery refreshes promptly and recovers without duplicates after reconnect.

**Independent Test**: Open two anonymous galleries, approve a photo through the admin flow, and confirm it appears in both within five seconds; disconnect/reconnect one client and confirm it resynchronizes with no duplicates. Confirm active/closed visibility and draft/archived denial.

### Implementation

- [ ] T023 [P] [US3] Build approved-only gallery layout and approved-photo counter in `album.html`
- [ ] T024 [US3] Query approved event photos and render only public-bucket URLs in `js/album.js` and `js/album-core.js`
- [ ] T025 [US3] Subscribe to event photo changes, refetch on reconnect, and upsert/remove gallery items by photo ID in `js/album-core.js`
- [ ] T026 [US3] Enforce public event/photo RLS visibility for active and closed events while hiding draft/archived events in `supabase/migrations/001_album.sql`
- [ ] T027 [US3] Reject public uploads for closed/draft/archived events at the server boundary in `supabase/functions/submit-photo/index.ts`
- [ ] T028 [US3] Add responsive gallery, empty-state, connection-state, and accessible photo-view styles in `css/album.css`

**Checkpoint**: Anonymous public reads expose approved photos only and reconnect refreshes canonical gallery state.

---

## Phase 6: User Story 4 - Administrar el evento y el acceso (Priority: P2)

**Goal**: Owners manage individual event memberships and event configuration; admin/moderator access is restricted to assigned capabilities.

**Independent Test**: Send a magic link to a new admin/moderator, sign in, verify event-scoped permissions and settings restrictions, then revoke that membership and verify administrative actions are denied.

### Implementation

- [ ] T029 [P] [US4] Build magic-link sign-in, event dashboard, statistics counters, and role-specific settings forms in `admin.html`
- [ ] T030 [US4] Implement Supabase Auth session handling, membership lookup, and revoked-session capability refresh in `js/admin.js`
- [ ] T031 [US4] Implement event-scoped administrator list/add/invite/revoke actions restricted to owner in `supabase/functions/manage-admin/index.ts`
- [ ] T032 [US4] Implement per-event settings and event detail updates with field-level owner/admin restrictions in `supabase/migrations/001_album.sql` and `js/admin.js`
- [ ] T033 [US4] Compute and display total, pending, approved, and rejected counters for the selected event in `js/admin.js`
- [ ] T034 [US4] Handle expired/revoked JWT or membership by clearing privileged UI state and requiring authorization refresh in `js/admin.js`

**Checkpoint**: Each account has individual event-scoped access, and revocation removes capabilities from ongoing sessions.

---

## Phase 7: User Story 5 - Compartir y proyectar el álbum (Priority: P2)

**Goal**: Admins can share/print a QR and open a full-screen approved-photo slideshow that updates live.

**Independent Test**: Generate, download, and print the QR; scan it and confirm the project-path album opens. Open projection, publish a photo, and verify slideshow updates without full reload and stays within a bounded number of rendered images.

### Implementation

- [ ] T035 [P] [US5] Add QR display/download/print, native share and copy-link fallback controls in `admin.html`
- [ ] T036 [US5] Generate the album URL relative to the deployed site path and wire QR/share/copy actions in `js/admin.js`
- [ ] T037 [P] [US5] Build full-screen projection markup and slideshow controls in `projection.html`
- [ ] T038 [US5] Implement ordered approved-photo slideshow, bounded rendering, and realtime updates in `js/projection.js`
- [ ] T039 [US5] Add projection layout, focus behavior, and reduced-motion presentation in `css/album.css`

**Checkpoint**: QR directs to the public album and live projection displays approved content without page reload.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validate end-to-end integration, security, accessibility, and existing site compatibility.

- [ ] T040 [P] Verify anonymous RLS and Storage denial for pending/rejected content and unauthorized mutations in `supabase/migrations/001_album.sql`
- [ ] T041 [P] Verify all internal links and assets resolve beneath `/boda-eli-joseluis/` in `index.html`, `album.html`, `admin.html`, and `projection.html`
- [ ] T042 Inspect browser-delivered HTML/JavaScript for privileged Supabase credentials in `js/supabase-config.js` and all static assets
- [ ] T043 Validate keyboard operation, labels, visible focus, and reduced-motion behavior in `album.html`, `admin.html`, `projection.html`, and `css/album.css`
- [ ] T044 Run the complete deployment and validation scenarios in `specs/001-album-colaborativo/quickstart.md`
- [ ] T045 Confirm the existing landing page and RSVP remain functional after album deployment in `index.html` and `rsvp.php`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; project provisioning documentation and configuration can be prepared immediately.
- **Foundational (Phase 2)**: Depends on Setup; schema, RLS, storage, and server-side authorization block all stories.
- **User Stories (Phases 3–7)**: Start after Foundational. US1 and US2 share the upload/moderation pipeline; US3 consumes the photo lifecycle from those flows. US4 and US5 can progress independently after foundational authorization and event access exist.
- **Polish (Phase 8)**: Run after the selected stories are integrated; deploy validation requires all feature surfaces intended for release.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2; guest upload and preparation can be independently validated.
- **US2 (P1)**: Starts after Phase 2; relies on photo records and private/published buckets, but can be exercised with seeded pending records.
- **US3 (P1)**: Starts after Phase 2; can be independently validated with approved seeded records; end-to-end new-photo validation integrates US1/US2.
- **US4 (P2)**: Starts after Phase 2; role and membership management can be tested independently of gallery/projection.
- **US5 (P2)**: Starts after Phase 2; QR and slideshow can be validated with approved seeded records. Admin launch/share controls integrate with US4.

### Parallel Opportunities

- Setup tasks T001 and T002 can run in parallel; T003 may follow page/base-path setup.
- Foundational RLS/bucket policy tasks T005 and T006 can proceed in parallel with Edge Function scaffolding T007/T008 after schema decisions in T004.
- After Phase 2, US1, US2, US3, US4, and US5 can be implemented in parallel by separate contributors, using separate story-owned files. Within US1, T010/T011/T013 can parallelize; within US5, T035/T037 can parallelize.
- Polish checks T040, T041, and T043 can run in parallel once story work is integrated.

## Parallel Example: User Story 1

```text
Task: T010 Build accessible camera and multi-file selection controls in album.html
Task: T011 Implement image preparation and client checks in js/album.js
Task: T013 Implement server-side file/event/rate validation in supabase/functions/submit-photo/index.ts
```

## Parallel Example: User Story 5

```text
Task: T035 Add QR/share/copy controls in admin.html
Task: T037 Build projection markup and controls in projection.html
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Setup and Foundational phases.
2. Complete US1 guest selection, preview, processing, upload, and retry.
3. Validate US1 independently on iPhone Safari and Android Chrome; manual publication may leave uploaded photos pending until US2 is delivered.
4. Continue with US2 and US3 for a complete moderated live-gallery release.

### Incremental Delivery

1. Establish schema/security foundation.
2. Deliver anonymous guest upload (US1), then moderation (US2) and live approved gallery (US3).
3. Add event administration/access management (US4) and QR/projection (US5).
4. Run cross-cutting deployment, accessibility, security, and RSVP checks before release.

## Notes

- Every task uses `- [ ] T###`, includes a concrete repository path, and carries `[US#]` only in a story phase.
- `[P]` marks tasks that can be performed independently on separate files after their stated phase prerequisites.
- Automated test tasks were omitted because neither the feature specification nor user requested test-first development.
