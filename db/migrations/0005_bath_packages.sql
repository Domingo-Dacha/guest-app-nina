alter table extras_cart_items
  drop constraint extras_cart_items_service_id_check,
  drop constraint extras_cart_items_quantity_service_check,
  drop constraint extras_cart_items_furako_options_check,
  drop constraint extras_cart_items_check1,
  add constraint extras_cart_items_service_id_check check (service_id in ('furako', 'breakfast', 'late-checkout', 'farm-basket', 'lunch', 'burger', 'dinner', 'bath-vensky', 'bath-vensky-furako', 'furako-vensky', 'bath-gavshino', 'bath-paradise', 'sup', 'bicycles', 'firewood')),
  add constraint extras_cart_items_quantity_service_check check (service_id in ('breakfast', 'sup', 'bicycles', 'firewood') or quantity = 1),
  add constraint extras_cart_items_furako_options_check check (service_id = 'furako' or (duration_days = 1 and not fir)),
  add constraint extras_cart_items_robes_service_check check (robes = 0 or service_id in ('furako', 'bath-vensky', 'bath-vensky-furako', 'furako-vensky', 'bath-gavshino', 'bath-paradise')),
  add constraint extras_cart_items_decoration_service_check check (not decoration or service_id in ('furako', 'bath-vensky-furako', 'furako-vensky')),
  add column duration_hours integer,
  add constraint extras_cart_items_duration_hours_check check (duration_hours is null or (service_id in ('bath-vensky', 'bath-vensky-furako') and duration_hours between 2 and 12));
-- statement-breakpoint
alter table extras_order_items
  drop constraint extras_order_items_service_id_check,
  drop constraint extras_order_items_quantity_service_check,
  drop constraint extras_order_items_furako_options_check,
  drop constraint extras_order_items_check1,
  add constraint extras_order_items_service_id_check check (service_id in ('furako', 'breakfast', 'late-checkout', 'farm-basket', 'lunch', 'burger', 'dinner', 'bath-vensky', 'bath-vensky-furako', 'furako-vensky', 'bath-gavshino', 'bath-paradise', 'sup', 'bicycles', 'firewood')),
  add constraint extras_order_items_quantity_service_check check (service_id in ('breakfast', 'sup', 'bicycles', 'firewood') or quantity = 1),
  add constraint extras_order_items_furako_options_check check (service_id = 'furako' or (duration_days = 1 and not fir)),
  add constraint extras_order_items_robes_service_check check (robes = 0 or service_id in ('furako', 'bath-vensky', 'bath-vensky-furako', 'furako-vensky', 'bath-gavshino', 'bath-paradise')),
  add constraint extras_order_items_decoration_service_check check (not decoration or service_id in ('furako', 'bath-vensky-furako', 'furako-vensky')),
  add column duration_hours integer,
  add constraint extras_order_items_duration_hours_check check (duration_hours is null or (service_id in ('bath-vensky', 'bath-vensky-furako') and duration_hours between 2 and 12));
