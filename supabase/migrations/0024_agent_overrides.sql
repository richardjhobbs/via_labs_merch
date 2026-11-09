-- Layered agents, phase 4: a person can pin an order to a desk regardless of the desk rules.
-- (Pause is agents.status = 'paused', added in 0017.)
alter table merch.agents add column if not exists pinned_parent_id uuid references merch.agents(id) on delete set null;
