# Data Model: Álbum colaborativo de fotos

The model is event-scoped. The initial SQL schema is defined in `supabase/migrations/001_album.sql`.

## Event (`events`)

- `id`: UUID primary key.
- `name`, `slug`: required display name and unique lowercase URL slug.
- `description`, `cover_image`, `event_date`: optional public/event details.
- `status`: `draft | active | closed | archived`; only active/closed are publicly readable; only active accepts uploads.
- `created_at`, `updated_at`: timestamps.
- **Relationships**: one event has one album settings row, many photos, and many event-admin memberships.
- **Validation**: slug matches lowercase alphanumeric groups separated by single hyphens.

## Album Settings (`album_settings`)

- `id`: UUID primary key; `event_id`: unique FK to event, cascade delete.
- `publication_mode`: `manual | automatic`, initially manual.
- `max_file_size`: bytes; initially 10 MiB, constrained to 1 KiB–50 MiB.
- `allowed_mime_types`: MIME allowlist, initially JPEG/PNG/WebP.
- `max_files_per_upload`: initially 5, constrained to 1–20.
- `share_message`: public sharing text.
- `created_at`, `updated_at`: timestamps.
- **Authorization**: admin/owner may update general settings; only owner may change publication mode. Owner controls allowed formats.

## Event Administrator (`album_admins`)

- `id`: UUID primary key; `event_id`: FK to event; `user_id`: FK to Supabase Auth user.
- `role`: `owner | admin | moderator`.
- `created_at`: timestamp; unique `(event_id, user_id)`.
- **Authorization**: owner manages event memberships; moderator can approve/reject; admin can additionally delete photos and manage permitted settings/statistics; owner has full event control.
- **Isolation**: role membership is evaluated per event; email is not an authorization input.

## Photo (`photos`)

- `id`: UUID primary key; `event_id`: FK to event.
- `status`: `pending | approved | rejected`, initially pending unless automatic publication succeeds.
- `storage_path`: required private inbox object path; `published_path`: nullable path in public bucket, populated only for approved photos.
- `original_filename`: optional; `mime_type`: validated accepted image MIME.
- `file_size`: positive bytes; `width`, `height`: positive validated pixel dimensions.
- `uploaded_at`, `approved_at`, `rejected_at`, `created_at`, `updated_at`: lifecycle timestamps.
- `deleted_at`: nullable deletion marker (normal admin/owner delete is permanent per current backend behavior).
- **State transitions**: pending → approved or rejected; approved can be deleted; automatic mode creates approved content after successful publication. A failed publish must not expose an unapproved file.
- **Visibility**: public readers see approved photos only for active/closed events; authorized event admins may inspect moderation queue. Anonymous writes are denied.
- **Retention**: photos and rejected records persist until an admin/owner deletes them; no age-based cleanup.

## Upload Rate Limit (`upload_rate_limits`)

- `bucket_key`: hashed IP/session key, primary key.
- `window_started_at`: fixed-window start; `request_count`: count in window.
- **Policy**: initial limit of 30 requests per key per 15 minutes; callable by service role only.

## Storage Objects

- `album-inbox`: private, server-managed incoming images, never directly readable by anonymous users.
- `album-published`: public read-only assets; only approved images are copied here. No anonymous/authenticated writes.
- Paths and all associated metadata are scoped to their event/photo records.
