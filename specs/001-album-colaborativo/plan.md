# Implementation Plan: Álbum colaborativo de fotos

**Branch**: `001-album-colaborativo` | **Date**: 2026-09-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-album-colaborativo/spec.md`

## Summary

Deliver an anonymous, mobile-friendly wedding photo album at the GitHub Pages project subpath, with a protected administration/projection experience. Use the existing static HTML/CSS/ES-module frontend and project-exclusive Supabase Postgres, Storage, Auth and Edge Functions. The server-side boundary validates public uploads, enforces event-scoped roles and separates private inbox files from approved public files.

## Technical Context

**Language/Version**: Browser JavaScript (ES modules); Supabase Edge Functions in TypeScript/Deno; PostgreSQL SQL migrations.
**Primary Dependencies**: Supabase JS v2.49.8 via ESM CDN; Supabase Auth, Postgres, Storage, Realtime and Edge Functions; native browser APIs.
**Storage**: Supabase Postgres plus private `album-inbox` and public `album-published` Storage buckets; GitHub Pages static assets.
**Testing**: Manual browser validation (iPhone Safari, Android Chrome, desktop); Supabase RLS/Storage/Edge Function integration scenarios; no repository test runner currently configured.
**Target Platform**: Static GitHub Pages at `/boda-eli-joseluis/`; Supabase-hosted backend.
**Project Type**: Static web application with serverless backend.
**Performance Goals**: Approved-photo updates visible to connected clients within 5 seconds; bounded projection and gallery item counts; upload progress and per-photo outcomes.
**Constraints**: Must work under a non-root deployment base path; no privileged key in browser; anonymous uploads limited to JPEG/PNG/WebP, 10 MB/photo and five photos/request initially; honor accessible keyboard/focus and reduced-motion behavior.
**Scale/Scope**: One initial wedding event; data model and authorization isolated by event; guest upload, public gallery, admin panel and projection.

## Constitution Check

The provided `.specify/memory/constitution.md` contains only unfilled template placeholders and defines no ratified principles, constraints, or governance gates. Therefore there are no project-specific constitution rules against which this design can fail; this is recorded as a repository governance gap, not treated as a feature clarification. The feature specification's security, accessibility, privacy and deployment requirements remain binding.

**Gate (pre-research)**: PASS — no actionable constitution gates are defined; no unresolved feature-spec clarifications remain.

## Project Structure

### Documentation (this feature)

```text
specs/001-album-colaborativo/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── edge-functions.md
    └── browser-interface.md
```

### Source Code (repository root)

```text
album.html
admin.html
projection.html
css/album.css
js/album.js
js/admin.js
js/projection.js
js/album-core.js
js/supabase-config.js
supabase/
├── migrations/001_album.sql
└── functions/
    ├── submit-photo/index.ts
    ├── moderate-photo/index.ts
    └── manage-admin/index.ts
```

**Structure Decision**: Keep this as a root-level static application matching the existing GitHub Pages site, with Supabase migrations and Edge Functions under `supabase/`. This preserves the existing RSVP/site deployment and avoids adding a build system or a separate frontend project.

## Complexity Tracking

No constitution violations identified. The constitution file itself remains an unfilled template.

## Phase 1 Constitution Re-check

PASS — the design maintains project-local Supabase infrastructure, server-side authorization and validation, static subpath-safe frontend links, and scoped data. No ratified constitution gates are available to evaluate.
