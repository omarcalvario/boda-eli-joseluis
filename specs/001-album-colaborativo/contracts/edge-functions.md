# Edge Function Contracts

All functions return JSON and CORS responses only for configured origins. `submit-photo` is public for guests; management functions require a valid Supabase Auth JWT. Service-role credentials are server-only.

## `submit-photo` (public)

- **Request**: `multipart/form-data` fields `event_slug`, `anonymous_session`, and repeated `files` (a single `file` is also accepted).
- **Validation**: event must be active; per-event file count/size/MIME allowlist, actual image content and dimensions must pass; rate limits apply. Client validation is advisory only.
- **Success**: `{ "results": [{ "filename": string, "id": string, "status": "pending" | "approved" } | { "filename": string, "error": string }] }`. Automatic mode publishes only after storage publication succeeds; mixed outcomes can be returned with HTTP 200, all-failed with HTTP 400.
- **Failure**: non-2xx JSON `{ "error": string }`; actionable validation/rate-limit errors. A failed item can be retried independently.
- **Security**: no guest identity fields required; no privileged key accepted from caller.

## `moderate-photo` (authenticated)

- **Request**: JSON `{ "event_id": string, "photo_id": string, "action": "approve" | "reject" | "delete" | "preview" }`. Preview returns a short-lived signed URL; moderator may approve/reject/preview; admin/owner may also delete.
- **Success**: JSON result describing the photo and new state; approval moves/copies the object to `album-published`, rejection removes the private image while retaining the record, deletion permanently removes record and objects.
- **Failure**: non-2xx JSON `{ "error": string }` for invalid input, missing resource, unauthorized role, or storage/database failure.
- **Security**: authenticated caller role is checked for the photo's event; client-supplied event/photo IDs do not confer authority.

## `manage-admin` (authenticated owner)

- **Request**: JSON `{ "event_id": string, "action": "list" | "add" | "revoke", ... }`. `add` includes `email` and `role` (`admin` or `moderator`); `revoke` includes `user_id`.
- **Success**: `list` returns `{ "administrators": [...] }`; add/revoke return `{ "ok": true }`. Access is event-specific and uses an individual Auth account/invitation.
- **Failure**: non-2xx JSON `{ "error": string }` for invalid role/event/email or missing owner authority.
- **Security**: only an owner of the target event can manage its memberships; never grant ownership via this endpoint.

## Database and Storage access contract

- Anonymous public reads: active/closed event and settings, approved photos only, and objects only from `album-published`.
- Authenticated admin reads: event-scoped rows allowed by membership; pending/rejected photo access is not granted to unrelated users.
- Direct public mutations of event settings, memberships, photos, and storage objects are denied; writes go through authorized functions/policies.
