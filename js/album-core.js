import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm';
import {
  EVENT_SLUG,
  PUBLIC_BUCKET,
  SUPABASE_ANON_KEY,
  SUPABASE_CONFIGURED,
  SUPABASE_URL,
} from './supabase-config.js';

export const supabase = SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  : null;

export function getEventSlug() {
  return EVENT_SLUG;
}

export function getAlbumUrl() {
  return new URL('./album.html', document.baseURI).href;
}

export function getProjectionUrl() {
  return new URL('./projection.html', document.baseURI).href;
}

export function getErrorMessage(error, fallback = 'Ocurrió un problema. Intenta de nuevo.') {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  return error.message || fallback;
}

export async function getEventContext(client = supabase, slug = EVENT_SLUG) {
  if (!client) throw new Error('Supabase aún no está configurado.');
  const { data: event, error: eventError } = await client.from('events')
    .select('id, name, slug, description, cover_image, event_date, status')
    .eq('slug', slug)
    .maybeSingle();
  if (eventError) throw eventError;
  if (!event) throw new Error('No se encontró el evento.');

  const { data: settings, error: settingsError } = await client.from('album_settings')
    .select('publication_mode, max_file_size, allowed_mime_types, max_files_per_upload, share_message')
    .eq('event_id', event.id)
    .maybeSingle();
  if (settingsError) throw settingsError;
  return { event, settings };
}

export async function fetchApprovedPhotos(client, eventId) {
  const { data, error } = await client.from('photos')
    .select('id, event_id, published_path, mime_type, width, height, approved_at, created_at')
    .eq('event_id', eventId)
    .eq('status', 'approved')
    .order('approved_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

export function getPhotoUrl(client, photo) {
  return client.storage.from(PUBLIC_BUCKET).getPublicUrl(photo.published_path).data.publicUrl;
}

export async function invokeFunction(client, functionName, body) {
  const { data, error } = await client.functions.invoke(functionName, { body });
  if (error) {
    let message = error.message;
    if (error.context) {
      try {
        const payload = await error.context.json();
        message = payload.error || message;
      } catch {
        // Conserva el mensaje del cliente cuando la respuesta no es JSON.
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function getAnonymousSessionId() {
  const key = 'boda-eli-joseluis-album-session';
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}

export function watchApprovedPhotos({ client, eventId, onChange, onStatus }) {
  let stopped = false;
  let channel;
  let reconnectTimer;
  let retry = 0;

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    const delay = Math.min(30000, 1000 * 2 ** retry);
    retry += 1;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = undefined;
      subscribe();
    }, delay);
  };

  const subscribe = () => {
    if (stopped) return;
    if (channel) client.removeChannel(channel);
    channel = client.channel(`album-photos-${eventId}-${crypto.randomUUID()}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'photos', filter: `event_id=eq.${eventId}`,
      }, (payload) => {
        const next = payload.new ?? {};
        const previous = payload.old ?? {};
        const affectsApproved = next.status === 'approved' || previous.status === 'approved';
        if (affectsApproved) onChange(payload);
      })
      .subscribe((status) => {
        onStatus?.(status);
        if (status === 'SUBSCRIBED') {
          retry = 0;
          onChange({ type: 'sync' });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          scheduleReconnect();
        }
      });
  };

  subscribe();
  return () => {
    stopped = true;
    if (reconnectTimer) window.clearTimeout(reconnectTimer);
    if (channel) client.removeChannel(channel);
  };
}

export function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
