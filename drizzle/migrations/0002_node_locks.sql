create table public.node_locks (
  node_id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  mode text not null default 'full' check (mode in ('move','full')),
  allowed uuid[] not null default '{}',
  locked_by uuid not null,
  locked_by_name text not null default '',
  created_at timestamptz not null default now()
);
grant select on public.node_locks to authenticated;
grant all on public.node_locks to service_role;
alter table public.node_locks enable row level security;
create policy "members read node locks" on public.node_locks for select to authenticated using (public.is_member(project_id, auth.uid()));
alter table public.node_locks replica identity full;
alter publication supabase_realtime add table public.node_locks;

create or replace function public._lock_blocks(_project uuid, _node uuid, _props jsonb, _user uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare nl public.node_locks%rowtype; k text;
begin
  select * into nl from public.node_locks where node_id = _node and project_id = _project;
  if not found then return null; end if;
  if nl.locked_by = _user or _user = any(nl.allowed) or public.project_role_of(_project, _user) = 'owner' then return null; end if;
  if nl.mode = 'full' then return nl.locked_by_name; end if;
  for k in select jsonb_object_keys(_props) loop
    if k ~ '^(x|y|w|h)(@.*)?$' or k = 'deleted' then return nl.locked_by_name; end if;
  end loop;
  return null;
end $$;

create or replace function public.set_node_lock(_project uuid, _node uuid, _mode text, _allowed uuid[], _label text)
returns text language plpgsql security definer set search_path = public as $$
declare nl public.node_locks%rowtype;
begin
  if not public.can_edit(_project, auth.uid()) then return 'forbidden'; end if;
  select * into nl from public.node_locks where node_id = _node;
  if found and nl.locked_by <> auth.uid() and public.project_role_of(_project, auth.uid()) <> 'owner' then return 'forbidden'; end if;
  if _mode is null then
    delete from public.node_locks where node_id = _node;
    insert into public.activity(project_id, actor_id, actor_name, action, target, outcome, node_id)
      values (_project, auth.uid(), public._actor_name(), 'unlocked', _label, 'applied', _node);
    return 'ok';
  end if;
  insert into public.node_locks(node_id, project_id, mode, allowed, locked_by, locked_by_name)
    values (_node, _project, _mode, coalesce(_allowed, '{}'), coalesce(nl.locked_by, auth.uid()), coalesce(nl.locked_by_name, public._actor_name()))
    on conflict (node_id) do update set mode = excluded.mode, allowed = excluded.allowed;
  insert into public.activity(project_id, actor_id, actor_name, action, target, outcome, node_id, detail)
    values (_project, auth.uid(), public._actor_name(), case when _mode = 'move' then 'pinned' else 'locked' end, _label, 'applied', _node, jsonb_build_object('mode', _mode));
  return 'ok';
end $$;
grant execute on function public.set_node_lock(uuid, uuid, text, uuid[], text) to authenticated;

CREATE OR REPLACE FUNCTION public.apply_node_op(_op_id text, _project uuid, _node uuid, _session text, _clock bigint, _actor text, _props jsonb, _action text, _label text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  l public.leases%rowtype;
  cur jsonb; k text; v jsonb; reg jsonb; merged jsonb; locker text;
  bef jsonb := '{}'::jsonb; aft jsonb := '{}'::jsonb;
begin
  if not public.can_edit(_project, auth.uid()) then
    insert into public.activity(project_id, actor_id, actor_name, action, target, outcome, node_id)
      values (_project, auth.uid(), public._actor_name(), _action, _label, 'blocked:no-permission', _node);
    return 'forbidden';
  end if;
  locker := public._lock_blocks(_project, _node, _props, auth.uid());
  if locker is not null then
    insert into public.activity(project_id, actor_id, actor_name, action, target, outcome, detail, node_id, after)
      values (_project, auth.uid(), public._actor_name(), _action, _label, 'blocked', jsonb_build_object('holder', locker || ' (locked)'), _node, _props);
    return 'locked';
  end if;
  begin
    insert into public.seen_ops(op_id, project_id) values (_op_id, _project);
  exception when unique_violation then return 'duplicate';
  end;
  select * into l from public.leases where node_id = _node and expires_at > now();
  if found and l.holder_session <> _session then
    insert into public.activity(project_id, actor_id, actor_name, action, target, outcome, detail, node_id, after)
      values (_project, auth.uid(), public._actor_name(), _action, _label, 'blocked', jsonb_build_object('holder', l.holder_name), _node, _props);
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
    bef := bef || jsonb_build_object(k, coalesce(reg->'v', 'null'::jsonb));
    if reg is null or (reg->>'c')::bigint < _clock or ((reg->>'c')::bigint = _clock and (reg->>'a') < _actor) then
      merged := merged || jsonb_build_object(k, jsonb_build_object('v', v, 'c', _clock, 'a', _actor));
      aft := aft || jsonb_build_object(k, v);
    end if;
  end loop;
  update public.nodes set props = merged, updated_at = now() where id = _node;
  insert into public.activity(project_id, actor_id, actor_name, action, target, outcome, node_id, before, after, detail)
    values (_project, auth.uid(), public._actor_name(), _action, _label, 'applied', _node, bef, aft,
      jsonb_build_object('type', merged->'type'->'v', 'page', merged->'page'->'v'));
  return 'applied';
end $function$;