alter table extras_cart_items
  drop constraint extras_cart_items_service_id_check,
  add constraint extras_cart_items_service_id_check check (service_id in ('furako', 'breakfast', 'late-checkout', 'farm-basket', 'lunch', 'burger', 'dinner', 'bath-vensky', 'bath-gavshino', 'bath-paradise', 'sup', 'bicycles'));
-- statement-breakpoint
alter table extras_order_items
  drop constraint extras_order_items_service_id_check,
  add constraint extras_order_items_service_id_check check (service_id in ('furako', 'breakfast', 'late-checkout', 'farm-basket', 'lunch', 'burger', 'dinner', 'bath-vensky', 'bath-gavshino', 'bath-paradise', 'sup', 'bicycles'));
