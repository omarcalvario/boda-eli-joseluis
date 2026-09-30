-- Album colaborativo independiente para boda Eli & Jose Luis.
-- La relacion con auth.users se utiliza solamente para administradores.

create extension if not exists pgcrypto;

do $$ begin
    create type public.event_status as enum ('draft', 'active', 'closed', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.publication_mode as enum ('manual', 'automatic');
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.photo_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
    create type public.album_admin_role as enum ('owner', 'admin', 'moderator');
exception when duplicate_object then null;
end $$;

create table if not exists public.events (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    description text,
    cover_image text,
    event_date timestamptz,
    status public.event_status not null default 'draft',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.album_settings (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null unique references public.events(id) on delete cascade,
    publication_mode public.publication_mode not null default 'manual',
    max_file_size bigint not null default 10485760 check (max_file_size between 1024 and 52428800),
    allowed_mime_types text[] not null default array['image/jpeg', 'image/png', 'image/webp']::text[],
    max_files_per_upload integer not null default 5 check (max_files_per_upload between 1 and 20),
    share_message text not null default 'Comparte tus fotos de Eli y Jose Luis',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.album_admins (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role public.album_admin_role not null,
    created_at timestamptz not null default now(),
    unique (event_id, user_id)
);

create table if not exists public.photos (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references public.events(id) on delete cascade,
    status public.photo_status not null default 'pending',
    storage_path text not null,
    published_path text,
    original_filename text,
    mime_type text not null,
    file_size bigint not null check (file_size > 0),
    width integer not null check (width > 0),
    height integer not null check (height > 0),
    uploaded_at timestamptz not null default now(),
    approved_at timestamptz,
    rejected_at timestamptz,
    deleted_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists photos_event_status_created_idx
    on public.photos (event_id, status, created_at desc);
create index if not exists album_admins_event_user_idx
    on public.album_admins (event_id, user_id);

alter table public.photos replica identity full;

create table if not exists public.upload_rate_limits (
    bucket_key text primary key,
    window_started_at timestamptz not null default now(),
    request_count integer not null default 0
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists album_settings_set_updated_at on public.album_settings;
create trigger album_settings_set_updated_at before update on public.album_settings
for each row execute function public.set_updated_at();

drop trigger if exists photos_set_updated_at on public.photos;
create trigger photos_set_updated_at before update on public.photos
for each row execute function public.set_updated_at();

create or replace function public.album_role(p_event_id uuid)
returns public.album_admin_role
language sql
stable
security definer
set search_path = public
as $$
    select role
    from public.album_admins
    where event_id = p_event_id and user_id = auth.uid()
    order by case role
        when 'owner' then 3
        when 'admin' then 2
        when 'moderator' then 1
    end desc
    limit 1;
$$;

create or replace function public.has_album_role(
    p_event_id uuid,
    p_required_role public.album_admin_role
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select coalesce((
        select case album_role(p_event_id)
            when 'owner' then 3
            when 'admin' then 2
            when 'moderator' then 1
            else 0
        end >= case p_required_role
            when 'owner' then 3
            when 'admin' then 2
            when 'moderator' then 1
        end
    ), false);
$$;

grant execute on function public.album_role(uuid) to anon, authenticated;
grant execute on function public.has_album_role(uuid, public.album_admin_role) to anon, authenticated;

create or replace function public.protect_album_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.event_id <> old.event_id then
        raise exception 'event_id cannot be changed';
    end if;

    if new.publication_mode is distinct from old.publication_mode
        and not public.has_album_role(old.event_id, 'owner'::public.album_admin_role) then
        raise exception 'only the event owner can change publication mode';
    end if;

    return new;
end;
$$;

drop trigger if exists album_settings_protect_update on public.album_settings;
create trigger album_settings_protect_update before update on public.album_settings
for each row execute function public.protect_album_settings();

create or replace function public.consume_upload_rate_limit(
    p_keys text[],
    p_limit integer default 30,
    p_window_seconds integer default 900
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    current_key text;
    current_count integer;
    allowed boolean := true;
begin
    foreach current_key in array p_keys loop
        insert into public.upload_rate_limits (bucket_key, window_started_at, request_count)
        values (current_key, now(), 1)
        on conflict (bucket_key) do update
        set request_count = case
                when public.upload_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
                    then 1
                else public.upload_rate_limits.request_count + 1
            end,
            window_started_at = case
                when public.upload_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
                    then now()
                else public.upload_rate_limits.window_started_at
            end;

        select request_count into current_count
        from public.upload_rate_limits
        where bucket_key = current_key;

        if current_count > p_limit then
            allowed := false;
        end if;
    end loop;

    return allowed;
end;
$$;

revoke all on function public.consume_upload_rate_limit(text[], integer, integer) from public, anon, authenticated;
grant execute on function public.consume_upload_rate_limit(text[], integer, integer) to service_role;

insert into public.events (name, slug, description, event_date, status)
values (
    'Eli & Jose Luis',
    'boda-eli-joseluis',
    'Album colaborativo de la boda de Eli y Jose Luis.',
    null,
    'active'
)
on conflict (slug) do nothing;

insert into public.album_settings (event_id, publication_mode, max_file_size, allowed_mime_types, max_files_per_upload)
select id, 'manual', 10485760, array['image/jpeg', 'image/png', 'image/webp']::text[], 5
from public.events
where slug = 'boda-eli-joseluis'
on conflict (event_id) do nothing;

alter table public.events enable row level security;
alter table public.album_settings enable row level security;
alter table public.album_admins enable row level security;
alter table public.photos enable row level security;
alter table public.upload_rate_limits enable row level security;

drop policy if exists events_public_read on public.events;
create policy events_public_read on public.events
for select to anon, authenticated
using (status in ('active', 'closed') or public.has_album_role(id, 'moderator'::public.album_admin_role));

drop policy if exists events_admin_update on public.events;
create policy events_admin_update on public.events
for update to authenticated
using (public.has_album_role(id, 'owner'::public.album_admin_role))
with check (public.has_album_role(id, 'owner'::public.album_admin_role));

drop policy if exists album_settings_public_read on public.album_settings;
create policy album_settings_public_read on public.album_settings
for select to anon, authenticated
using (exists (
    select 1 from public.events e where e.id = event_id and e.status in ('active', 'closed')
) or public.has_album_role(event_id, 'moderator'::public.album_admin_role));

drop policy if exists album_settings_admin_update on public.album_settings;
create policy album_settings_admin_update on public.album_settings
for update to authenticated
using (public.has_album_role(event_id, 'admin'::public.album_admin_role))
with check (public.has_album_role(event_id, 'admin'::public.album_admin_role));

drop policy if exists album_admins_read on public.album_admins;
create policy album_admins_read on public.album_admins
for select to authenticated
using (user_id = auth.uid() or public.has_album_role(event_id, 'admin'::public.album_admin_role));

drop policy if exists album_admins_owner_insert on public.album_admins;
create policy album_admins_owner_insert on public.album_admins
for insert to authenticated
with check (
    public.has_album_role(event_id, 'owner'::public.album_admin_role)
    and role in ('admin'::public.album_admin_role, 'moderator'::public.album_admin_role)
);

drop policy if exists album_admins_owner_delete on public.album_admins;
create policy album_admins_owner_delete on public.album_admins
for delete to authenticated
using (
    public.has_album_role(event_id, 'owner'::public.album_admin_role)
    and role <> 'owner'::public.album_admin_role
);

drop policy if exists photos_public_read_approved on public.photos;
create policy photos_public_read_approved on public.photos
for select to anon, authenticated
using (
    (status = 'approved'
        and exists (select 1 from public.events e where e.id = event_id and e.status in ('active', 'closed')))
    or public.has_album_role(event_id, 'moderator'::public.album_admin_role)
);

-- No se crean politicas INSERT/UPDATE/DELETE para photos: solo las Edge Functions
-- con service_role pueden alterar el ciclo de vida de una fotografia.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
    ('album-inbox', 'album-inbox', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']::text[]),
    ('album-published', 'album-published', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']::text[])
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$ begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'photos'
    ) then
        alter publication supabase_realtime add table public.photos;
    end if;
exception when undefined_object then
    raise notice 'supabase_realtime publication is not available yet';
end $$;

drop policy if exists album_published_public_read on storage.objects;
create policy album_published_public_read on storage.objects
for select to anon, authenticated
using (bucket_id = 'album-published');

-- No se conceden escrituras a anon/authenticated en ninguno de los dos buckets.
