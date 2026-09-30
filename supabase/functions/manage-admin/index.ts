import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ORIGINS = ['https://omarcalvario.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function cors(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? '';
  const configured = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  const allowed = configured.length ? configured : ORIGINS;
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(request), 'Content-Type': 'application/json' } });
}

async function getUser(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data } = await client.auth.getUser(token);
  return data.user ?? null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(request) });
  if (request.method !== 'POST') return json(request, { error: 'Método no permitido.' }, 405);

  try {
    const user = await getUser(request);
    if (!user) return json(request, { error: 'Autenticación requerida.' }, 401);
    const body = await request.json();
    const eventId = String(body.event_id ?? '');
    const action = String(body.action ?? '');
    const { data: owner } = await admin.from('album_admins').select('role')
      .eq('event_id', eventId).eq('user_id', user.id).eq('role', 'owner').maybeSingle();
    if (!owner) return json(request, { error: 'Solo el owner puede administrar usuarios.' }, 403);

    if (action === 'list') {
      const { data: memberships, error } = await admin.from('album_admins').select('id, user_id, role, created_at')
        .eq('event_id', eventId).order('created_at');
      if (error) throw error;
      const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const byId = new Map((users.data.users ?? []).map((item) => [item.id, item.email ?? '']));
      return json(request, { administrators: (memberships ?? []).map((item) => ({ ...item, email: byId.get(item.user_id) ?? '' })) });
    }

    if (action === 'add') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const role = String(body.role ?? '');
      if (!/^\S+@\S+\.\S+$/.test(email) || !['admin', 'moderator'].includes(role)) {
        return json(request, { error: 'Correo o rol inválido.' }, 400);
      }
      const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      let target = (users.data.users ?? []).find((item) => item.email?.toLowerCase() === email);
      if (!target) {
        const invited = await admin.auth.admin.inviteUserByEmail(email);
        if (invited.error || !invited.data.user) return json(request, { error: 'No se pudo invitar al administrador.' }, 500);
        target = invited.data.user;
      }
      const { data: existing } = await admin.from('album_admins').select('role')
        .eq('event_id', eventId).eq('user_id', target.id).maybeSingle();
      if (existing?.role === 'owner') return json(request, { error: 'El owner no puede cambiarse desde este formulario.' }, 400);
      const { error } = await admin.from('album_admins').upsert({ event_id: eventId, user_id: target.id, role }, { onConflict: 'event_id,user_id' });
      if (error) throw error;
      return json(request, { ok: true });
    }

    if (action === 'revoke') {
      const userId = String(body.user_id ?? '');
      if (!userId) return json(request, { error: 'Administrador inválido.' }, 400);
      const { data: target } = await admin.from('album_admins').select('role').eq('event_id', eventId).eq('user_id', userId).maybeSingle();
      if (!target || target.role === 'owner') return json(request, { error: 'El owner no puede revocarse desde aquí.' }, 400);
      const { error } = await admin.from('album_admins').delete().eq('event_id', eventId).eq('user_id', userId);
      if (error) throw error;
      return json(request, { ok: true });
    }

    return json(request, { error: 'Acción inválida.' }, 400);
  } catch (error) {
    console.error('manage-admin failed', error);
    return json(request, { error: 'No se pudo administrar el acceso.' }, 500);
  }
});
