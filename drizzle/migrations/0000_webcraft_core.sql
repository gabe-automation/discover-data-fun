
create type public.project_role as enum ('owner','editor','viewer');

create table public.profiles (
  id uuid primary key,
  display_name text not null default 'Anonymous',
  color text not null default '#c2410c',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles readable by signed in" on public.profiles for select to authenticated using (true);
create policy "own profile insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare palette text[] := array['#c2410c','#4d7c0f','#0f766e','#a16207','#9f1239','#1d4ed8','#7c2d12','#15803d'];
begin
  insert into public.profiles(id, display_name, color)
  values (new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    palette[1 + floor(random()*8)::int])
  on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null,
  theme jsonb not null default '{"primary":"#c2410c","accent":"#4d7c0f","surface":"#faf7f2","ink":"#1c1917"}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  role public.project_role not null default 'editor',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_members to authenticated;
grant all on public.projects to service_role;
grant all on public.project_members to service_role;

create or replace function public.project_role_of(_project uuid, _user uuid) returns public.project_role
language sql stable security definer set search_path = public as $$
  select role from public.project_members where project_id = _project and user_id = _user
$$;
create or replace function public.is_member(_project uuid, _user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.project_members where project_id=_project and user_id=_user)
$$;
create or replace function public.can_edit(_project uuid, _user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.project_members where project_id=_project and user_id=_user and role in ('owner','editor'))
$$;

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
create policy "members read projects" on public.projects for select to authenticated using (public.is_member(id, auth.uid()));
create policy "editors update projects" on public.projects for update to authenticated using (public.can_edit(id, auth.uid()));
create policy "owner deletes project" on public.projects for delete to authenticated using (owner_id = auth.uid());
create policy "members read members" on public.project_members for select to authenticated using (public.is_member(project_id, auth.uid()));
create policy "owner manages members" on public.project_members for all to authenticated
  using (public.project_role_of(project_id, auth.uid()) = 'owner')
  with check (public.project_role_of(project_id, auth.uid()) = 'owner');

create table public.nodes (
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  props jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index on public.nodes(project_id);
grant select on public.nodes to authenticated;
grant all on public.nodes to service_role;
alter table public.nodes enable row level security;
create policy "members read nodes" on public.nodes for select to authenticated using (public.is_member(project_id, auth.uid()));

create table public.seen_ops (
  op_id text primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant all on public.seen_ops to service_role;
alter table public.seen_ops enable row level security;

create table public.leases (
  node_id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  holder_id uuid not null,
  holder_session text not null,
  holder_name text not null,
  holder_color text not null,
  expires_at timestamptz not null
);
grant select on public.leases to authenticated;
grant all on public.leases to service_role;
alter table public.leases enable row level security;
create policy "members read leases" on public.leases for select to authenticated using (public.is_member(project_id, auth.uid()));

create table public.activity (
  id bigserial primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid,
  actor_name text not null,
  action text not null,
  target text not null,
  outcome text not null default 'applied',
  detail jsonb,
  created_at timestamptz not null default now()
);
create index on public.activity(project_id, created_at desc);
grant select on public.activity to authenticated;
grant all on public.activity to service_role;
grant usage on sequence public.activity_id_seq to service_role;
alter table public.activity enable row level security;
create policy "members read activity" on public.activity for select to authenticated using (public.is_member(project_id, auth.uid()));

create or replace function public._actor_name() returns text language sql stable security definer set search_path=public as $$
  select coalesce((select display_name from public.profiles where id = auth.uid()), 'Someone')
$$;

create or replace function public.create_project(_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.projects(name, owner_id) values (coalesce(nullif(trim(_name),''),'Untitled site'), auth.uid()) returning id into pid;
  insert into public.project_members(project_id, user_id, role) values (pid, auth.uid(), 'owner');
  insert into public.activity(project_id, actor_id, actor_name, action, target) values (pid, auth.uid(), public._actor_name(), 'created', 'project');
  return pid;
end $$;

create or replace function public.add_member_by_email(_project uuid, _email text, _role public.project_role) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if public.project_role_of(_project, auth.uid()) is distinct from 'owner' then raise exception 'only owners can invite'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(_email));
  if uid is null then return 'not_found'; end if;
  insert into public.project_members(project_id,user_id,role) values (_project, uid, _role)
    on conflict (project_id,user_id) do update set role = excluded.role;
  return 'ok';
end $$;

create or replace function public.apply_node_op(
  _op_id text, _project uuid, _node uuid, _session text, _clock bigint, _actor text, _props jsonb, _action text, _label text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  l public.leases%rowtype;
  cur jsonb;
  k text; v jsonb; reg jsonb;
  merged jsonb;
begin
  if not public.can_edit(_project, auth.uid()) then
    insert into public.activity(project_id, actor_id, actor_name, action, target, outcome)
      values (_project, auth.uid(), public._actor_name(), _action, _label, 'blocked:no-permission');
    return 'forbidden';
  end if;
  begin
    insert into public.seen_ops(op_id, project_id) values (_op_id, _project);
  exception when unique_violation then
    return 'duplicate';
  end;
  select * into l from public.leases where node_id = _node and expires_at > now();
  if found and l.holder_session <> _session then
    insert into public.activity(project_id, actor_id, actor_name, action, target, outcome, detail)
      values (_project, auth.uid(), public._actor_name(), _action, _label, 'blocked', jsonb_build_object('holder', l.holder_name));
    return 'blocked';
  end if;
  select props into cur from public.nodes where id = _node and project_id = _project for update;
  if not found then
    cur := '{}'::jsonb;
    insert into public.nodes(id, project_id, props) values (_node, _project, '{}');
  end if;
  merged := cur;
  for k, v in select * from jsonb_each(_props) loop
    reg := cur -> k;
    if reg is null
       or (reg->>'c')::bigint < _clock
       or ((reg->>'c')::bigint = _clock and (reg->>'a') < _actor) then
      merged := merged || jsonb_build_object(k, jsonb_build_object('v', v, 'c', _clock, 'a', _actor));
    end if;
  end loop;
  update public.nodes set props = merged, updated_at = now() where id = _node;
  insert into public.activity(project_id, actor_id, actor_name, action, target, outcome)
    values (_project, auth.uid(), public._actor_name(), _action, _label, 'applied');
  return 'applied';
end $$;

create or replace function public.acquire_lease(_project uuid, _node uuid, _session text, _ttl int, _label text, _heartbeat boolean)
returns boolean language plpgsql security definer set search_path = public as $$
declare l public.leases%rowtype; p public.profiles%rowtype; had boolean;
begin
  if not public.can_edit(_project, auth.uid()) then return false; end if;
  select * into l from public.leases where node_id = _node for update;
  had := found;
  if had and l.expires_at > now() and l.holder_session <> _session then
    if not _heartbeat then
      insert into public.activity(project_id, actor_id, actor_name, action, target, outcome, detail)
        values (_project, auth.uid(), public._actor_name(), 'lock', _label, 'blocked', jsonb_build_object('holder', l.holder_name));
    end if;
    return false;
  end if;
  select * into p from public.profiles where id = auth.uid();
  insert into public.leases(node_id, project_id, holder_id, holder_session, holder_name, holder_color, expires_at)
    values (_node, _project, auth.uid(), _session, coalesce(p.display_name,'Someone'), coalesce(p.color,'#c2410c'), now() + make_interval(secs => least(greatest(_ttl,5),60)))
  on conflict (node_id) do update set holder_id = excluded.holder_id, holder_session = excluded.holder_session,
    holder_name = excluded.holder_name, holder_color = excluded.holder_color, expires_at = excluded.expires_at;
  if not _heartbeat and (not had or l.holder_session <> _session or l.expires_at <= now()) then
    insert into public.activity(project_id, actor_id, actor_name, action, target) values (_project, auth.uid(), public._actor_name(), 'locked', _label);
  end if;
  delete from public.leases where project_id = _project and expires_at < now() - interval '1 minute';
  return true;
end $$;

create or replace function public.release_lease(_project uuid, _node uuid, _session text, _label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.leases where node_id = _node and holder_session = _session;
  if found then
    insert into public.activity(project_id, actor_id, actor_name, action, target) values (_project, auth.uid(), public._actor_name(), 'unlocked', _label);
  end if;
end $$;

revoke execute on function public.apply_node_op(text,uuid,uuid,text,bigint,text,jsonb,text,text) from anon, public;
revoke execute on function public.acquire_lease(uuid,uuid,text,int,text,boolean) from anon, public;
revoke execute on function public.release_lease(uuid,uuid,text,text) from anon, public;
revoke execute on function public.create_project(text) from anon, public;
revoke execute on function public.add_member_by_email(uuid,text,public.project_role) from anon, public;
grant execute on function public.apply_node_op(text,uuid,uuid,text,bigint,text,jsonb,text,text) to authenticated;
grant execute on function public.acquire_lease(uuid,uuid,text,int,text,boolean) to authenticated;
grant execute on function public.release_lease(uuid,uuid,text,text) to authenticated;
grant execute on function public.create_project(text) to authenticated;
grant execute on function public.add_member_by_email(uuid,text,public.project_role) to authenticated;

alter table public.nodes replica identity full;
alter table public.leases replica identity full;
alter publication supabase_realtime add table public.nodes;
alter publication supabase_realtime add table public.leases;
alter publication supabase_realtime add table public.activity;
