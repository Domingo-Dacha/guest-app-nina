alter table extras_order_items
  add column work_status text not null default 'new' check (work_status in ('new','in_progress','ready','completed')),
  add column staff_version integer not null default 0 check (staff_version >= 0);
-- statement-breakpoint
create table staff_task_events (
  id uuid primary key,
  team_slug text not null,
  stay_id text not null,
  order_id uuid not null,
  item_id uuid not null,
  actor_id text not null,
  actor_name text not null,
  action text not null check (action in ('confirm','in_progress','ready','completed')),
  detail text not null check (char_length(detail) <= 200),
  created_at timestamptz not null default now(),
  foreign key (team_slug,stay_id,order_id,item_id) references extras_order_items(team_slug,stay_id,order_id,id)
);
-- statement-breakpoint
create index staff_task_events_scope_idx on staff_task_events(team_slug,order_id,item_id,created_at);
-- statement-breakpoint
create table staff_transfer_records (
  team_slug text not null,
  stay_id text not null,
  order_id uuid not null,
  status text not null default 'pending' check (status in ('pending','transferred','needs_review','error')),
  version integer not null default 0 check (version >= 0),
  booking_reference text not null default '' check (char_length(booking_reference) <= 120),
  record_reference text not null default '' check (char_length(record_reference) <= 160),
  note text not null default '' check (char_length(note) <= 1000),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (team_slug,order_id),
  foreign key (team_slug,stay_id,order_id) references extras_orders(team_slug,stay_id,id),
  check (status <> 'transferred' or (length(trim(booking_reference)) > 0 and length(trim(record_reference)) > 0))
);
-- statement-breakpoint
create table staff_transfer_events (
  id uuid primary key,
  team_slug text not null,
  stay_id text not null,
  order_id uuid not null,
  actor_id text not null,
  actor_name text not null,
  status text not null check (status in ('pending','transferred','needs_review','error')),
  booking_reference text not null,
  record_reference text not null,
  note text not null,
  created_at timestamptz not null default now(),
  foreign key (team_slug,stay_id,order_id) references extras_orders(team_slug,stay_id,id)
);
-- statement-breakpoint
create index staff_tasks_date_idx on extras_order_items(team_slug,service_date,requested_time);
