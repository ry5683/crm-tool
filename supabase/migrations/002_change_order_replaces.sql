-- 002: Let a new change order replace an older one.
-- Why: once a change order is sent, its rows are never edited. Changes after
-- sending create a NEW change order that points back at the one it replaces,
-- so the database keeps a record of exactly what the customer approved.

-- Empty (null) for a first version, which replaces nothing.
-- First, add the new column. Think of it as a 'replaces #__' box on the form.
alter table public.change_orders
  add column replaces_id uuid;

-- "A change order's replaces_id must match the id of a real row in
-- change_orders, in the same business."
alter table public.change_orders
  add foreign key (business_id, replaces_id)
    references public.change_orders (business_id, id);

-- A change order can be replaced only once, so there is never more than one
-- "latest version." (Nulls don't count as duplicates, so first versions are fine.)
alter table public.change_orders
  add unique (replaces_id);
