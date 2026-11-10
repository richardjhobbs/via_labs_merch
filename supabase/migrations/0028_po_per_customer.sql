-- A PO number is unique per customer, not per company: each brand numbers its own POs, so two customers
-- can both send PO 1 (Tony, 10 Nov 2026). Orders with no customer still clash with each other.
alter table merch.orders drop constraint if exists orders_tenant_id_po_key;
create unique index if not exists orders_tenant_customer_po_key on merch.orders (tenant_id, customer_id, po) nulls not distinct;
create index if not exists orders_tenant_po_idx on merch.orders (tenant_id, po);
