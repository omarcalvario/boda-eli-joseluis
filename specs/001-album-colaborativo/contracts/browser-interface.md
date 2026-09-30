# Browser Interface Contract

## Guest album (`album.html`)

- Load at `/boda-eli-joseluis/album.html` without authentication or personal information.
- Provide camera capture and multi-image selection, preview/removal, upload progress, per-item success/error, and individual retry.
- Permit JPEG, PNG and WebP initially; enforce configured size/count and explain unsupported or undecodable HEIC/HEIF.
- Show only approved photos for active/closed events; active events accept uploads, closed events do not.
- Reflect approvals in a connected gallery and refresh canonical state after reconnect.
- Keyboard operable controls, visible focus, accessible labels, and reduced-motion support.

## Admin (`admin.html`)

- Authenticate administrators by Supabase email magic link.
- Resolve capability from membership for the selected event, not from email or UI-only checks.
- Display total/pending/approved/rejected counters and available moderation/configuration actions by role.
- Owner manages event, publication mode, formats, and individual admin/moderator membership; admin moderates/deletes and changes share message/upload limits; moderator approves/rejects only.

## Projection (`projection.html`)

- Present approved images in a full-screen sequence, update while connected, recover current state after reconnect, and keep rendered items bounded.
- Respect reduced-motion preferences and provide usable controls/exit behavior.

## Deployment path

All internal page, asset, and navigation URLs must resolve relative to the deployed project base path; do not assume the domain root.
