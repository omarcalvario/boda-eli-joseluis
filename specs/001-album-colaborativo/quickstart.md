# Quickstart: validation guide

## Prerequisites

- New Supabase project dedicated to this repository.
- Supabase CLI and a static HTTP server (for example, Python 3).
- Owner access to the Supabase project and a test email inbox for magic links.

## Provision and deploy

1. Create a dedicated Supabase project; enable Email authentication.
2. Apply `supabase/migrations/001_album.sql` (`supabase link --project-ref <project-ref>` then `supabase db push`).
3. Deploy `submit-photo` with `--no-verify-jwt`, then deploy `moderate-photo` and `manage-admin` with JWT verification enabled.
4. Set the documented `ALLOWED_ORIGINS` secret and verify Supabase-managed URL/keys are available to functions. Keep the service role key exclusively in Supabase secrets.
5. Set `SUPABASE_URL` and publishable/anon key in `js/supabase-config.js`. Assign the initial owner membership as described in `supabase/README.md`.
6. Serve the repo root over HTTP (`python -m http.server 8000`) and open `http://localhost:8000/album.html`; configure the production Auth redirect to the GitHub Pages `admin.html` URL.

## Validation scenarios

1. **Guest upload**: open album in a private browser session on iPhone Safari and Android Chrome; select/capture multiple images, remove one, upload the rest. Expect progress and an individual result without login or personal-data prompts.
2. **Validation and retry**: submit an unsupported/oversized file and interrupt a valid upload. Expect a clear rejection for invalid input and an individual retry that does not require reselecting successful photos.
3. **Moderation and access**: test moderator, admin, owner, and anonymous sessions. Confirm allowed actions and forbidden actions match [browser-interface.md](contracts/browser-interface.md); pending photos remain absent from guest gallery.
4. **Realtime recovery**: keep two galleries and one projection open; approve a photo, then disconnect/reconnect a client. Expect appearance within five seconds while connected and no duplicate visible item after resync.
5. **Event lifecycle**: verify active allows read/upload, closed allows read but rejects upload, and draft/archived are not publicly accessible.
6. **QR and deployment prefix**: generate/download/print QR and scan it; confirm it resolves beneath `/boda-eli-joseluis/` and the site/RSVP continue to load.
7. **Security**: as anonymous, attempt reading pending/rejected photos and mutating settings, memberships, photos, and storage. Expect denial; inspect shipped frontend assets to confirm no service-role secret.
8. **Accessibility**: complete upload and admin workflows by keyboard; verify visible focus, labels, and reduced-motion behavior.

See [data-model.md](data-model.md) for entities and [contracts](contracts/) for browser/backend expectations.
