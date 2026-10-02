-- Allow standalone robes without rewriting carts or historical orders.
alter table extras_cart_items
  drop constraint extras_cart_items_service_id_check,
  drop constraint extras_cart_items_quantity_service_check,
  add constraint extras_cart_items_service_id_check check (service_id in ('furako', 'breakfast', 'late-checkout', 'farm-basket', 'lunch', 'burger', 'dinner', 'bath-vensky', 'bath-vensky-furako', 'furako-vensky', 'bath-gavshino', 'bath-paradise', 'sup', 'bicycles', 'firewood', 'robe')),
  add constraint extras_cart_items_quantity_service_check check (service_id in ('breakfast', 'sup', 'bicycles', 'firewood', 'robe') or quantity = 1);
-- statement-breakpoint
alter table extras_order_items
  drop constraint extras_order_items_service_id_check,
  drop constraint extras_order_items_quantity_service_check,
  add constraint extras_order_items_service_id_check check (service_id in ('furako', 'breakfast', 'late-checkout', 'farm-basket', 'lunch', 'burger', 'dinner', 'bath-vensky', 'bath-vensky-furako', 'furako-vensky', 'bath-gavshino', 'bath-paradise', 'sup', 'bicycles', 'firewood', 'robe')),
  add constraint extras_order_items_quantity_service_check check (service_id in ('breakfast', 'sup', 'bicycles', 'firewood', 'robe') or quantity = 1);
