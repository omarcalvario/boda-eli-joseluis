# Research: Álbum colaborativo de fotos

## Decisions

### Static frontend deployed below a path prefix

- **Decision**: Keep the frontend as static HTML, CSS and native ES modules; resolve sibling pages and assets relative to the current document and deploy at `/boda-eli-joseluis/`.
- **Rationale**: The repository is already a GitHub Pages site with this structure, and the feature explicitly requires the project path. A framework/build migration adds deployment risk without being necessary for the required UI.
- **Alternatives considered**: A client-side SPA/router or a separate frontend project. These add build/deployment complexity and root-path assumptions.

### Supabase as the dedicated backend

- **Decision**: Use a new Supabase project exclusive to this site for Postgres, Auth, Storage, Realtime and Edge Functions; expose only the publishable key in browser configuration.
- **Rationale**: The specification explicitly requires Supabase and isolation from other projects. The repository's README and frontend configuration establish the project-specific pattern.
- **Alternatives considered**: Reusing an existing project (forbidden by FR-022); a custom server (unnecessary and not currently deployed).

### Server-side upload and moderation boundary

- **Decision**: Route guest submissions through the public `submit-photo` Edge Function, which validates files/event/limits and uses service-role access server-side. Require authenticated JWT for management and moderation functions; enforce roles and row/storage access with RLS and policies.
- **Rationale**: Browser validation is bypassable, and guests need no account. Edge Functions keep privileged credentials off the static client and enable basic rate limiting.
- **Alternatives considered**: Direct anonymous writes to Storage or database. Rejected because it exposes write paths and cannot securely enforce all validation and lifecycle rules.

### Private inbox, public approved storage, and event-scoped records

- **Decision**: Persist uploads in a private bucket and publish only after approval to a separate public bucket; use event IDs as authorization/data scope and slug for public routing.
- **Rationale**: This gives a clear public visibility boundary and supports moderation while allowing approved assets to load efficiently without signed URLs.
- **Alternatives considered**: One public bucket (risks leaking pending content); signed URLs for all approved photos (unneeded complexity for the public gallery).

### Realtime with snapshot resynchronization

- **Decision**: Subscribe to approved-photo changes, refresh the authoritative approved-photo query on subscription/reconnect, and deduplicate by photo ID in the client.
- **Rationale**: Realtime events can be missed during disconnection; the query restores current state and avoids duplicate UI entries.
- **Alternatives considered**: Polling only (adds latency and requests); relying only on Realtime events (does not recover missed events).

### Image preparation and validation

- **Decision**: Client-side decode/re-encode where supported to normalize orientation, reduce size and remove metadata, while server independently checks allowed MIME/type, actual content, size, dimensions, event state and count. Initially accept JPEG, PNG and WebP; explain unsupported HEIC/HEIF and recommend compatible JPEG.
- **Rationale**: This follows the spec's compatibility and privacy requirements, and server checks remain authoritative.
- **Alternatives considered**: Trust client metadata (unsafe); silently broaden to HEIC (not supported by initial backend contract).

### Constitution status

- **Decision**: Record no project constitution constraints as enforceable because the supplied constitution is an unfilled template.
- **Rationale**: All principle and governance fields contain placeholders. The explicit functional and non-functional requirements in `spec.md` are used as the design gates.
- **Alternatives considered**: Inventing principles in the plan (would misrepresent project governance); blocking planning (the feature spec and implementation context are sufficiently defined).

## Clarification Resolution

All feature ambiguities recorded in `clarifications.md` are resolved: event-state access, admin configuration scope, and retention policy. No `NEEDS CLARIFICATION` items remain.
