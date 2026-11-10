-- Owners and managers invite their own people from Settings (Team): the invite carries the job title and the
-- tracks as well as the customers (scopes), applied when the person accepts.
alter table merch.invites add column if not exists title text;
alter table merch.invites add column if not exists tracks text[];
