import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const DEFAULT_ORIGINS = [
  'https://omarcalvario.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
];
const INBOX_BUCKET = 'album-inbox';
const PUBLISHED_BUCKET = 'album-published';
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_DIMENSION = 10000;
const MAX_PIXELS = 40_000_000;

type Dimensions = { width: number; height: number } | null;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = configured.length ? configured : DEFAULT_ORIGINS;
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function extensionFor(file: File): string | null {
  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  if (extension === 'jpg' || extension === 'jpeg') return 'jpg';
  if (extension === 'png') return 'png';
  if (extension === 'webp') return 'webp';
  return null;
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

function readImageDimensions(bytes: Uint8Array, mime: string): Dimensions {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (mime === 'image/png' && bytes.length >= 24 && readUint32(view, 0) === 0x89504e47) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (mime === 'image/webp' && bytes.length >= 30) {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    const chunk = String.fromCharCode(...bytes.slice(12, 16));
    if (riff !== 'RIFF' || webp !== 'WEBP') return null;
    if (chunk === 'VP8X') {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { width, height };
    }
    if (chunk === 'VP8L' && bytes[20] === 0x2f && bytes.length >= 25) {
      const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
      const height = 1 + ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10));
      return { width, height };
    }
    if (chunk === 'VP8 ' && bytes.length >= 30) {
      const start = 20;
      if (bytes[start + 3] === 0x9d && bytes[start + 4] === 0x01 && bytes[start + 5] === 0x2a) {
        return {
          width: bytes[start + 6] | (bytes[start + 7] << 8),
          height: bytes[start + 8] | (bytes[start + 9] << 8),
        };
      }
    }
    return null;
  }

  if (mime === 'image/jpeg' && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > bytes.length) break;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      const isStartOfFrame = (marker >= 0xc0 && marker <= 0xc3)
        || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb)
        || (marker >= 0xcd && marker <= 0xcf);
      if (isStartOfFrame && offset + 7 < bytes.length) {
        return {
          height: (bytes[offset + 3] << 8) | bytes[offset + 4],
          width: (bytes[offset + 5] << 8) | bytes[offset + 6],
        };
      }
      if (length < 2) break;
      offset += length;
    }
  }

  return null;
}

function hasExpectedSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mime === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (mime === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return false;
}

function getClientAddress(request: Request): string {
  return request.headers.get('cf-connecting-ip')
    ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    ?? 'unknown';
}

async function sha256(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function publishObject(
  bytes: Uint8Array,
  mime: string,
  publishedPath: string,
): Promise<void> {
  const upload = await admin.storage.from(PUBLISHED_BUCKET).upload(publishedPath, bytes, {
    contentType: mime,
    cacheControl: '31536000',
    upsert: false,
  });
  if (upload.error) throw upload.error;
}

async function removeObjectWithRetry(bucket: string, path: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { error } = await admin.storage.from(bucket).remove([path]);
    if (!error) return;
    lastError = error;
  }
  throw lastError instanceof Error ? lastError : new Error('No se pudo limpiar un archivo temporal.');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) });
  if (request.method !== 'POST') return json(request, { error: 'Método no permitido.' }, 405);

  try {
    const form = await request.formData();
    const eventSlug = String(form.get('event_slug') ?? '').trim();
    const sessionId = String(form.get('anonymous_session') ?? '').slice(0, 100);
    const files = form.getAll('files').filter((value): value is File => value instanceof File);
    const singleFile = form.get('file');
    if (!files.length && singleFile instanceof File) files.push(singleFile);
    if (!eventSlug || !files.length) return json(request, { error: 'Evento y fotografías son obligatorios.' }, 400);

    const { data: event, error: eventError } = await admin
      .from('events')
      .select('id, slug, status')
      .eq('slug', eventSlug)
      .eq('status', 'active')
      .maybeSingle();
    if (eventError || !event) return json(request, { error: 'El evento no está disponible.' }, 404);

    const { data: settings, error: settingsError } = await admin
      .from('album_settings')
      .select('publication_mode, max_file_size, allowed_mime_types, max_files_per_upload')
      .eq('event_id', event.id)
      .single();
    if (settingsError || !settings) return json(request, { error: 'La configuración del álbum no está disponible.' }, 500);
    if (files.length > settings.max_files_per_upload) {
      return json(request, { error: `Puedes subir hasta ${settings.max_files_per_upload} fotografías por envío.` }, 400);
    }

    const ipHash = await sha256(`ip:${getClientAddress(request)}`);
    const sessionHash = await sha256(`session:${sessionId || 'missing'}`);
    const { data: allowed, error: rateError } = await admin.rpc('consume_upload_rate_limit', {
      p_keys: [`ip:${ipHash}`, `session:${sessionHash}`],
      p_limit: 30,
      p_window_seconds: 900,
    });
    if (rateError || allowed !== true) return json(request, { error: 'Se alcanzó el límite temporal de envíos. Intenta más tarde.' }, 429);

    const results: Array<{ filename: string; id?: string; status?: string; error?: string }> = [];
    for (const file of files) {
      const filename = file.name.slice(0, 255);
      try {
        const mime = file.type.toLowerCase();
        const extension = extensionFor(file);
        const configuredTypes = new Set(settings.allowed_mime_types ?? [...ALLOWED_MIME_TYPES]);
        if (!ALLOWED_MIME_TYPES.has(mime) || !configuredTypes.has(mime) || !extension) throw new Error('Formato no permitido. Usa JPEG, PNG o WebP.');
        // Supabase Storage enforces the bucket's 10 MiB hard cap independently
        // of event settings. The effective limit is the lower of both values.
        const effectiveFileLimit = Math.min(Number(settings.max_file_size), 10 * 1024 * 1024);
        if (file.size <= 0 || file.size > effectiveFileLimit) throw new Error('La fotografía supera el tamaño permitido (máximo 10 MB).');

        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!hasExpectedSignature(bytes, mime)) throw new Error('El contenido de la fotografía no es válido.');
        const dimensions = readImageDimensions(bytes, mime);
        if (!dimensions || dimensions.width > MAX_DIMENSION || dimensions.height > MAX_DIMENSION || dimensions.width * dimensions.height > MAX_PIXELS) {
          throw new Error('No se pudieron validar las dimensiones de la fotografía.');
        }

        const photoId = crypto.randomUUID();
        const inboxPath = `${event.id}/${photoId}.${extension}`;
        const publishedPath = `${event.id}/${photoId}.${extension}`;
        const upload = await admin.storage.from(INBOX_BUCKET).upload(inboxPath, bytes, {
          contentType: mime,
          cacheControl: '86400',
          upsert: false,
        });
        if (upload.error) throw upload.error;

        const { data: photo, error: insertError } = await admin.from('photos').insert({
          id: photoId,
          event_id: event.id,
          status: 'pending',
          storage_path: inboxPath,
          original_filename: filename,
          mime_type: mime,
          file_size: file.size,
          width: dimensions.width,
          height: dimensions.height,
        }).select('id').single();
        if (insertError || !photo) {
          try { await removeObjectWithRetry(INBOX_BUCKET, inboxPath); } catch (cleanupError) {
            console.error('submit-photo could not clean unregistered inbox object', photoId, cleanupError);
          }
          throw insertError ?? new Error('No se pudo registrar la fotografía.');
        }

        let status = 'pending';
        if (settings.publication_mode === 'automatic') {
          const publicationToken = crypto.randomUUID();
          const { data: claimed, error: claimError } = await admin.from('photos').update({ moderation_token: publicationToken })
            .eq('id', photoId).eq('status', 'pending').is('moderation_token', null).select('id').maybeSingle();
          if (claimError || !claimed) throw claimError ?? new Error('La fotografía ya está siendo procesada.');

          try {
            await publishObject(bytes, mime, publishedPath);
            await removeObjectWithRetry(INBOX_BUCKET, inboxPath);
            const { data: approved, error: publishError } = await admin.from('photos').update({
              status: 'approved',
              published_path: publishedPath,
              approved_at: new Date().toISOString(),
              moderation_token: null,
            }).eq('id', photoId).eq('status', 'pending').eq('moderation_token', publicationToken)
              .select('id').maybeSingle();
            let committed = Boolean(approved);
            if (!committed && publishError) {
              const { data: confirmed } = await admin.from('photos').select('status, published_path')
                .eq('id', photoId).maybeSingle();
              committed = confirmed?.status === 'approved' && confirmed.published_path === publishedPath;
            }
            if (!committed) throw publishError ?? new Error('La fotografía cambió de estado antes de publicarse.');
          } catch (uploadError) {
            // Compensate both sides so a failed approval remains pending/private.
            try { await removeObjectWithRetry(PUBLISHED_BUCKET, publishedPath); } catch (cleanupError) {
              console.error('submit-photo could not clean failed automatic publication', photoId, cleanupError);
            }
            try {
              const { error: restoreError } = await admin.storage.from(INBOX_BUCKET).upload(inboxPath, bytes, {
                contentType: mime, cacheControl: '86400', upsert: true,
              });
              if (restoreError) throw restoreError;
            } catch (restoreError) {
              console.error('submit-photo could not restore private photo after failed automatic publication', photoId, restoreError);
            }
            const { error: releaseError } = await admin.from('photos').update({ moderation_token: null })
              .eq('id', photoId).eq('status', 'pending').eq('moderation_token', publicationToken);
            if (releaseError) {
              console.error('submit-photo could not release automatic publication lock', photoId, releaseError);
            }
            throw uploadError;
          }
          status = 'approved';
        }
        results.push({ filename, id: photoId, status });
      } catch (error) {
        results.push({ filename, error: error instanceof Error ? error.message : 'No se pudo procesar la fotografía.' });
      }
    }

    const succeeded = results.filter((result) => result.id).length;
    return json(request, { results }, succeeded ? 200 : 400);
  } catch (error) {
    console.error('submit-photo failed', error);
    return json(request, { error: 'No se pudo procesar el envío.' }, 500);
  }
});
