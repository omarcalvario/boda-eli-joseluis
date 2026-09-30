-- Protect album settings by role and serialize moderation actions per photo.

alter table public.photos
    add column if not exists moderation_token uuid;

alter table public.photos
    add constraint photos_moderation_token_unique unique (moderation_token);

-- Storage is provisioned with a 10 MiB hard object limit. Keep per-event
-- settings no higher than that bucket limit; the initial value remains 10 MiB.
alter table public.album_settings
    add constraint album_settings_max_file_size_storage_limit
    check (max_file_size between 1024 and 10485760) not valid;

alter table public.album_settings
    add constraint album_settings_allowed_mime_types_supported
    check (
        cardinality(allowed_mime_types) > 0
        and allowed_mime_types <@ array['image/jpeg', 'image/png', 'image/webp']::text[]
    ) not valid;

create or replace function public.protect_album_settings_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    current_role public.album_admin_role;
begin
    if auth.role() = 'service_role' then
        return new;
    end if;

    if new.id is distinct from old.id
        or new.event_id is distinct from old.event_id
        or new.created_at is distinct from old.created_at then
        raise exception 'album setting identity fields cannot be changed'
            using errcode = '42501';
    end if;

    current_role := public.album_role(old.event_id);
    if current_role is null then
        raise exception 'event membership required to update album settings'
            using errcode = '42501';
    end if;

    if current_role = 'moderator' then
        raise exception 'moderators cannot update album settings'
            using errcode = '42501';
    end if;

    if current_role = 'admin' and (
        (to_jsonb(new) - array['share_message', 'max_file_size', 'max_files_per_upload', 'updated_at'])
        is distinct from
        (to_jsonb(old) - array['share_message', 'max_file_size', 'max_files_per_upload', 'updated_at'])
    ) then
        raise exception 'admins may update only share_message, max_file_size, and max_files_per_upload'
            using errcode = '42501';
    end if;

    if new.max_file_size > 10485760 then
        raise exception 'max_file_size cannot exceed the album Storage bucket limit of 10 MiB'
            using errcode = '23514';
    end if;

    if cardinality(new.allowed_mime_types) = 0
        or not (new.allowed_mime_types <@ array['image/jpeg', 'image/png', 'image/webp']::text[]) then
        raise exception 'allowed_mime_types must contain supported image formats'
            using errcode = '23514';
    end if;

    return new;
end;
$$;

drop trigger if exists album_settings_protect_fields on public.album_settings;
create trigger album_settings_protect_fields
before update on public.album_settings
for each row execute function public.protect_album_settings_fields();

-- Existing RLS already limits updates to admin/owner. Retain that policy;
-- the trigger above provides field-level enforcement even for direct API calls.
