create table extras_carts (
  team_slug text not null check (team_slug ~ '^[a-z0-9-]{1,48}$'),
  stay_id text not null,
  version integer not null default 0 check (version >= 0),
  primary key (team_slug, stay_id)
);
-- statement-breakpoint
create table extras_cart_items (
  team_slug text not null,
  stay_id text not null,
  id uuid not null,
  service_id text not null check (service_id in ('furako', 'breakfast', 'late-checkout')),
  service_date date not null,
  requested_time text not null,
  quantity integer not null check (quantity between 1 and 6),
  decoration boolean not null default false,
  unit_price integer not null check (unit_price >= 0),
  addon_price integer not null check (addon_price >= 0),
  created_at timestamptz not null default now(),
  primary key (team_slug, stay_id, id),
  foreign key (team_slug, stay_id) references extras_carts (team_slug, stay_id),
  check (service_id = 'breakfast' or quantity = 1),
  check (not decoration or service_id = 'furako')
);
-- statement-breakpoint
create table extras_orders (
  id uuid primary key,
  team_slug text not null check (team_slug ~ '^[a-z0-9-]{1,48}$'),
  stay_id text not null,
  cart_version integer not null check (cart_version >= 0),
  idempotency_key uuid not null,
  guest_name text not null,
  guest_contact text not null,
  house_name text not null,
  check_in date not null,
  check_out date not null check (check_out >= check_in),
  check_in_time text not null,
  check_out_time text not null,
  guests integer not null check (guests > 0),
  comment text not null default '' check (char_length(comment) <= 1000),
  total integer not null check (total > 0),
  payment_status text not null check (payment_status in ('paid', 'refund_pending', 'refunded')),
  created_at timestamptz not null default now(),
  unique (team_slug, stay_id, id),
  unique (team_slug, stay_id, idempotency_key),
  unique (team_slug, stay_id, cart_version),
  foreign key (team_slug, stay_id) references extras_carts (team_slug, stay_id)
);
-- statement-breakpoint
create table extras_order_items (
  team_slug text not null,
  stay_id text not null,
  order_id uuid not null,
  id uuid not null,
  service_id text not null check (service_id in ('furako', 'breakfast', 'late-checkout')),
  name text not null,
  addon_name text,
  service_date date not null,
  requested_time text not null,
  confirmed_time text,
  quantity integer not null check (quantity between 1 and 6),
  decoration boolean not null,
  unit_price integer not null check (unit_price >= 0),
  addon_price integer not null check (addon_price >= 0),
  fulfillment_status text not null check (fulfillment_status in ('awaiting_approval', 'confirmed', 'completed', 'cancelled')),
  primary key (team_slug, stay_id, order_id, id),
  foreign key (team_slug, stay_id, order_id) references extras_orders (team_slug, stay_id, id),
  check (service_id = 'breakfast' or quantity = 1),
  check (not decoration or service_id = 'furako')
);
-- statement-breakpoint
create index extras_orders_stay_created_idx on extras_orders (team_slug, stay_id, created_at desc);
