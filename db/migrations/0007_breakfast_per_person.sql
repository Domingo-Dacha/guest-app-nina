-- NULL is the legacy unit: breakfast was a set for two. New code always writes
-- 1 explicitly. Keeping NULL also protects orders from the previous deployment
-- during the brief interval between migration and publication.
alter table extras_cart_items
  add column servings_per_unit integer check (servings_per_unit in (1,2) and (service_id='breakfast' or servings_per_unit=1)),
  drop constraint extras_cart_items_quantity_check,
  add constraint extras_cart_items_quantity_check check (quantity between 1 and case when service_id='breakfast' then 12 else 6 end);
-- statement-breakpoint
alter table extras_order_items
  add column servings_per_unit integer check (servings_per_unit in (1,2) and (service_id='breakfast' or servings_per_unit=1)),
  drop constraint extras_order_items_quantity_check,
  add constraint extras_order_items_quantity_check check (quantity between 1 and case when service_id='breakfast' then 12 else 6 end);
