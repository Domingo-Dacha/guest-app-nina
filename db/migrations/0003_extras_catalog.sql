alter table extras_cart_items
  drop constraint extras_cart_items_service_id_check,
  drop constraint extras_cart_items_check,
  add constraint extras_cart_items_service_id_check check (service_id in ('furako', 'breakfast', 'late-checkout', 'farm-basket', 'lunch', 'dinner', 'bath-vensky', 'bath-gavshino', 'bath-paradise', 'sup', 'bicycles')),
  add constraint extras_cart_items_quantity_service_check check (service_id in ('breakfast', 'sup', 'bicycles') or quantity = 1),
  add column duration_days integer not null default 1 check (duration_days in (1, 2)),
  add column fir boolean not null default false,
  add column robes integer not null default 0 check (robes between 0 and 6),
  add column fir_price integer not null default 0 check (fir_price >= 0),
  add column robe_price integer not null default 0 check (robe_price >= 0),
  add constraint extras_cart_items_furako_options_check check (service_id = 'furako' or (duration_days = 1 and not fir and robes = 0));
-- statement-breakpoint
alter table extras_order_items
  drop constraint extras_order_items_service_id_check,
  drop constraint extras_order_items_check,
  add constraint extras_order_items_service_id_check check (service_id in ('furako', 'breakfast', 'late-checkout', 'farm-basket', 'lunch', 'dinner', 'bath-vensky', 'bath-gavshino', 'bath-paradise', 'sup', 'bicycles')),
  add constraint extras_order_items_quantity_service_check check (service_id in ('breakfast', 'sup', 'bicycles') or quantity = 1),
  add column duration_days integer not null default 1 check (duration_days in (1, 2)),
  add column fir boolean not null default false,
  add column robes integer not null default 0 check (robes between 0 and 6),
  add column fir_price integer not null default 0 check (fir_price >= 0),
  add column robe_price integer not null default 0 check (robe_price >= 0),
  add constraint extras_order_items_furako_options_check check (service_id = 'furako' or (duration_days = 1 and not fir and robes = 0));
-- statement-breakpoint
alter table extras_orders
  drop constraint extras_orders_total_check,
  drop constraint extras_orders_payment_status_check,
  add constraint extras_orders_total_check check (total >= 0),
  add constraint extras_orders_payment_status_check check (payment_status in ('paid', 'not_required', 'refund_pending', 'refunded')),
  add constraint extras_orders_free_payment_check check ((total = 0 and payment_status = 'not_required') or (total > 0 and payment_status <> 'not_required'));
