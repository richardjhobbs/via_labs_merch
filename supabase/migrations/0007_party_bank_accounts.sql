-- Bank accounts of customers and suppliers. A changed bank account is the classic invoice fraud, so an account
-- read from a document or typed in is only ever "pending" until an owner or manager has checked it outside the
-- document and confirmed it. Rules live in the database:
--   * anyone adding (owner, manager, merchandiser) can only insert pending rows;
--   * only an owner or manager can decide, and the decider and time are stamped here, not by the app;
--   * the account details can never change after insert: a different account is a new row;
--   * no deletes, so the history stays; VIA Labs support grants do not reach this table.
-- Agents have no tool that reads this table.
create table merch.party_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references merch.tenants(id) on delete cascade,
  party_id uuid not null references merch.parties(id) on delete cascade,
  beneficiary text,
  bank_name text,
  bank_address text,
  account_no text not null,
  swift text,
  bank_code text,
  branch_code text,
  currency text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected', 'superseded')),
  source text not null default 'manual',          -- manual | document
  source_file text,
  added_by uuid default auth.uid(),
  added_by_name text,
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_by_name text,
  decided_at timestamptz,
  confirm_method text,                            -- known_phone | in_person | known_contact | other
  confirm_note text,                              -- who was spoken to, or why it was rejected
  check (status <> 'confirmed' or (confirm_method is not null and confirm_note is not null))
);
create index on merch.party_bank_accounts (tenant_id, party_id, status);

alter table merch.party_bank_accounts enable row level security;
create policy bank_read on merch.party_bank_accounts for select using (merch.my_role(tenant_id) in ('owner', 'manager', 'merchandiser'));
create policy bank_add on merch.party_bank_accounts for insert with check (merch.my_role(tenant_id) in ('owner', 'manager', 'merchandiser') and status = 'pending');
create policy bank_decide on merch.party_bank_accounts for update using (merch.my_role(tenant_id) in ('owner', 'manager'));

revoke all on merch.party_bank_accounts from anon;
revoke delete, truncate on merch.party_bank_accounts from authenticated;

create or replace function merch.bank_account_guard() returns trigger language plpgsql as $$
begin
  if (new.tenant_id, new.party_id, new.beneficiary, new.bank_name, new.bank_address, new.account_no, new.swift, new.bank_code, new.branch_code, new.currency, new.source, new.source_file, new.added_by, new.added_by_name, new.created_at)
     is distinct from
     (old.tenant_id, old.party_id, old.beneficiary, old.bank_name, old.bank_address, old.account_no, old.swift, old.bank_code, old.branch_code, old.currency, old.source, old.source_file, old.added_by, old.added_by_name, old.created_at) then
    raise exception 'Bank account details cannot be changed. Add the new account instead.';
  end if;
  if not ((old.status = 'pending' and new.status in ('confirmed', 'rejected')) or (old.status = 'confirmed' and new.status = 'superseded')) then
    raise exception 'A bank account cannot go from % to %.', old.status, new.status;
  end if;
  if old.status = 'pending' then
    new.decided_by := auth.uid();
    new.decided_at := now();
  else
    -- Superseding keeps the record of who confirmed the account and how.
    new.decided_by := old.decided_by; new.decided_by_name := old.decided_by_name; new.decided_at := old.decided_at;
    new.confirm_method := old.confirm_method; new.confirm_note := old.confirm_note;
  end if;
  return new;
end $$;
create trigger bank_guard before update on merch.party_bank_accounts for each row execute function merch.bank_account_guard();
