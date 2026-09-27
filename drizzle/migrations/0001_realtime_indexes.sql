alter table public.leases replica identity full;
create index if not exists text_updates_project_idx on public.text_updates(project_id, id);
create index if not exists messages_project_idx on public.messages(project_id, created_at);