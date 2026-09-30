// Solo contiene valores publicables. Nunca colocar aqui la service_role key.
export const SUPABASE_URL = 'REPLACE_WITH_THIS_PROJECT_SUPABASE_URL';
export const SUPABASE_ANON_KEY = 'REPLACE_WITH_THIS_PROJECT_PUBLISHABLE_KEY';
export const EVENT_SLUG = 'boda-eli-joseluis';
export const SUPABASE_JS_VERSION = '2.49.8';

export const SUPABASE_CONFIGURED = !SUPABASE_URL.startsWith('REPLACE_')
  && !SUPABASE_ANON_KEY.startsWith('REPLACE_');

export const PUBLIC_BUCKET = 'album-published';
