import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ORIGINS = ['https://omarcalvario.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
const INBOX_BUCKET = 'album-inbox';
const PUBLISHED_BUCKET = 'album-published';

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function headers(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  const origins = allowed.length ? allowed : ORIGINS;
  return {
    'Access-Control-Allow-Origin': origins.includes(origin) ? origin : origins[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function response(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers(request), 'Content-Type': 'application/json' } });
}

async function authenticate(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data } = await client.auth.getUser(token);
  return data.user ?? null;
}

async function removeObject(bucket: string, path: string): Promise<void> {
  if (!path) return;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await admin.storage.from(bucket).remove([path]);
    if (!error) return;
    lastError = error;
  }
  throw lastError instanceof Error ? lastError : new Error('No se pudo eliminar el archivo de Storage.');
}

async function restoreObject(bucket: string, path: string, data: Blob, contentType: string): Promise<void> {
  const { error } = await admin.storage.from(bucket).upload(path, data, {
    contentType,
    cacheControl: bucket === PUBLISHED_BUCKET ? '31536000' : '86400',
    upsert: true,
  });
  if (error) throw error;
}

async function releasePhoto(photoId: string, eventId: string, token: string): Promise<void> {
  const { error } = await admin.from('photos').update({ moderation_token: null })
    .eq('id', photoId).eq('event_id', eventId).eq('moderation_token', token);
  if (error) console.error('moderate-photo could not release photo lock', photoId, error);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: headers(request) });
  if (request.method !== 'POST') return response(request, { error: 'Método no permitido.' }, 405);

  let lock: { photoId: string; eventId: string; token: string } | null = null;
  try {
    const user = await authenticate(request);
    if (!user) return response(request, { error: 'Autenticación requerida.' }, 401);
    const body = await request.json();
    const photoId = String(body.photo_id ?? '');
    const eventId = String(body.event_id ?? '');
    const action = String(body.action ?? '');
    if (!photoId || !eventId || !['approve', 'reject', 'delete', 'preview'].includes(action)) {
      return response(request, { error: 'Solicitud inválida.' }, 400);
    }

    const { data: membership, error: membershipError } = await admin.from('album_admins')
      .select('role').eq('event_id', eventId).eq('user_id', user.id).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return response(request, { error: 'No tienes acceso a este evento.' }, 403);
    if (action === 'delete' && !['owner', 'admin'].includes(membership.role)) {
      return response(request, { error: 'Tu rol no puede eliminar fotografías.' }, 403);
    }

    const { data: current, error: readError } = await admin.from('photos')
      .select('id, event_id, status, storage_path, published_path, mime_type, moderation_token')
      .eq('id', photoId).eq('event_id', eventId).maybeSingle();
    if (readError) throw readError;
    if (!current) return response(request, { error: 'Fotografía no encontrada.' }, 404);

    if (action === 'preview') {
      const path = current.status === 'approved' ? current.published_path : current.storage_path;
      const bucket = current.status === 'approved' ? PUBLISHED_BUCKET : INBOX_BUCKET;
      if (!path) return response(request, { error: 'La fotografía no tiene archivo disponible.' }, 404);
      const { data: signed, error: signedError } = await admin.storage.from(bucket).createSignedUrl(path, 300);
      if (signedError || !signed?.signedUrl) return response(request, { error: 'No se pudo generar la vista previa.' }, 500);
      return response(request, { url: signed.signedUrl });
    }

    if (current.moderation_token) return response(request, { error: 'La fotografía ya está siendo procesada. Actualiza la lista e intenta de nuevo.' }, 409);
    if (action !== 'delete' && current.status !== 'pending') {
      return response(request, { error: 'Solo se pueden aprobar o rechazar fotografías pendientes.' }, 409);
    }

    // Atomic compare-and-set claim: exactly one moderation request can proceed.
    const token = crypto.randomUUID();
    const { data: claimed, error: claimError } = await admin.from('photos')
      .update({ moderation_token: token })
      .eq('id', photoId).eq('event_id', eventId).eq('status', current.status).is('moderation_token', null)
      .select('id, event_id, status, storage_path, published_path, mime_type').maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return response(request, { error: 'La fotografía cambió mientras se procesaba la acción. Actualiza la lista e intenta de nuevo.' }, 409);
    lock = { photoId, eventId, token };

    if (action === 'approve') {
      const { data: file, error: downloadError } = await admin.storage.from(INBOX_BUCKET).download(claimed.storage_path);
      if (downloadError || !file) throw downloadError ?? new Error('No se encontró el archivo recibido.');
      const publishedPath = claimed.published_path ?? claimed.storage_path;
      const { error: uploadError } = await admin.storage.from(PUBLISHED_BUCKET).upload(publishedPath, file, {
        contentType: claimed.mime_type,
        cacheControl: '31536000',
        upsert: false,
      });
      if (uploadError) {
        try { await removeObject(PUBLISHED_BUCKET, publishedPath); } catch (cleanupError) {
          console.error('moderate-photo could not clean failed public upload', photoId, cleanupError);
        }
        throw uploadError;
      }

      const { data: approved, error: updateError } = await admin.from('photos').update({
        status: 'approved', published_path: publishedPath, approved_at: new Date().toISOString(), moderation_token: null,
      }).eq('id', photoId).eq('event_id', eventId).eq('status', 'pending').eq('moderation_token', token)
        .select('id').maybeSingle();
      let committed = Boolean(approved);
      if (!committed && updateError) {
        const { data: confirmed } = await admin.from('photos').select('status, published_path, moderation_token')
          .eq('id', photoId).eq('event_id', eventId).maybeSingle();
        committed = confirmed?.status === 'approved'
          && confirmed.published_path === publishedPath
          && confirmed.moderation_token === null;
      }
      if (!committed) {
        try { await removeObject(PUBLISHED_BUCKET, publishedPath); } catch (cleanupError) {
          console.error('moderate-photo could not remove uncommitted public object', photoId, cleanupError);
        }
        return response(request, { error: updateError ? 'No se pudo guardar la aprobación.' : 'La fotografía cambió antes de completar la aprobación.' }, updateError ? 500 : 409);
      }
      lock = null;

      try {
        await removeObject(INBOX_BUCKET, claimed.storage_path);
      } catch (cleanupError) {
        // Approved content is valid and public; a private duplicate is safe.
        // Report it for operational cleanup without reverting a committed state.
        console.error('moderate-photo could not remove approved photo from inbox', photoId, cleanupError);
        return response(request, { ok: true, status: 'approved', cleanup_pending: true });
      }
      return response(request, { ok: true, status: 'approved' });
    }

    if (action === 'reject') {
      const { data: file, error: downloadError } = await admin.storage.from(INBOX_BUCKET).download(claimed.storage_path);
      if (downloadError || !file) throw downloadError ?? new Error('No se encontró el archivo recibido.');
      const { error: removeError } = await admin.storage.from(INBOX_BUCKET).remove([claimed.storage_path]);
      if (removeError) throw removeError;
      const { data: rejected, error: updateError } = await admin.from('photos').update({
        status: 'rejected', rejected_at: new Date().toISOString(), moderation_token: null,
      }).eq('id', photoId).eq('event_id', eventId).eq('status', 'pending').eq('moderation_token', token)
        .select('id').maybeSingle();
      if (updateError || !rejected) {
        if (updateError) {
          const { data: confirmed } = await admin.from('photos').select('status, moderation_token')
            .eq('id', photoId).eq('event_id', eventId).maybeSingle();
          if (confirmed?.status === 'rejected' && confirmed.moderation_token === null) {
            lock = null;
            return response(request, { ok: true, status: 'rejected' });
          }
        }
        let restored = true;
        try { await restoreObject(INBOX_BUCKET, claimed.storage_path, file, claimed.mime_type); } catch (restoreError) {
          restored = false;
          console.error('moderate-photo could not restore rejected photo after database conflict', photoId, restoreError);
        }
        if (!restored) {
          const { data: safelyRejected, error: fallbackError } = await admin.from('photos').update({
            status: 'rejected', rejected_at: new Date().toISOString(), moderation_token: null,
          }).eq('id', photoId).eq('event_id', eventId).eq('status', 'pending').eq('moderation_token', token)
            .select('id').maybeSingle();
          if (!fallbackError && safelyRejected) {
            lock = null;
            return response(request, { ok: true, status: 'rejected', cleanup_pending: true });
          }
        }
        return response(request, { error: 'La fotografía cambió antes de completar el rechazo.' }, 409);
      }
      lock = null;
      return response(request, { ok: true, status: 'rejected' });
    }

    // Delete holds the lock while removing both possible objects. If removal
    // fails, restore any object already removed and leave the row intact.
    const snapshots: Array<{ bucket: string; path: string; data: Blob; contentType: string }> = [];
    for (const [bucket, path] of [[INBOX_BUCKET, claimed.storage_path], [PUBLISHED_BUCKET, claimed.published_path]] as const) {
      if (!path) continue;
      const { data, error } = await admin.storage.from(bucket).download(path);
      if (!error && data) snapshots.push({ bucket, path, data, contentType: claimed.mime_type });
      else if (error && !String(error.message).toLowerCase().includes('not found')) throw error;
    }

    const removed: typeof snapshots = [];
    try {
      for (const snapshot of snapshots) {
        await removeObject(snapshot.bucket, snapshot.path);
        removed.push(snapshot);
      }
    } catch (storageError) {
      for (const snapshot of removed) {
        try { await restoreObject(snapshot.bucket, snapshot.path, snapshot.data, snapshot.contentType); } catch (restoreError) {
          console.error('moderate-photo could not restore object after partial deletion', photoId, snapshot.bucket, restoreError);
        }
      }
      throw storageError;
    }

    const { data: deleted, error: deleteError } = await admin.from('photos').delete()
      .eq('id', photoId).eq('event_id', eventId).eq('status', claimed.status).eq('moderation_token', token)
      .select('id').maybeSingle();
    if (deleteError || !deleted) {
      if (deleteError) {
        const { data: currentAfterDelete } = await admin.from('photos').select('id')
          .eq('id', photoId).eq('event_id', eventId).maybeSingle();
        if (!currentAfterDelete) {
          lock = null;
          return response(request, { ok: true, status: 'deleted' });
        }
      }
      for (const snapshot of removed) {
        try { await restoreObject(snapshot.bucket, snapshot.path, snapshot.data, snapshot.contentType); } catch (restoreError) {
          console.error('moderate-photo could not restore object after database delete conflict', photoId, snapshot.bucket, restoreError);
        }
      }
      return response(request, { error: 'La fotografía cambió antes de completar la eliminación.' }, 409);
    }
    lock = null;
    return response(request, { ok: true, status: 'deleted' });
  } catch (error) {
    console.error('moderate-photo failed', error);
    return response(request, { error: error instanceof Error ? error.message : 'No se pudo completar la moderación.' }, 500);
  } finally {
    if (lock) await releasePhoto(lock.photoId, lock.eventId, lock.token);
  }
});
