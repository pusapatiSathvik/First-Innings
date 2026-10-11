-- Stage 1 foundation: profiles and trusted account roles.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'player', 'captain', 'match_official')),
  created_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id),
  unique (user_id, role)
);

create index user_roles_user_id_idx on public.user_roles(user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  insert into public.user_roles (user_id, role) values (new.id, 'player');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Role rows are intentionally not writable by clients. Admin bootstrap is performed
-- by a trusted project owner through the procedure documented in docs/security.md.
create policy "Users can read their own roles"
  on public.user_roles for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;
revoke insert, delete on public.profiles from anon, authenticated;
grant select, update on public.profiles to authenticated;

