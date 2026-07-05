-- Regular: one document per user, protected by row-level security.
-- The app stores its whole ledger as a single JSON document (see README);
-- every derived number is recomputed client-side by replaying it.

create table if not exists public.documents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "Users can read own document"
  on public.documents for select
  using (auth.uid() = user_id);

create policy "Users can insert own document"
  on public.documents for insert
  with check (auth.uid() = user_id);

create policy "Users can update own document"
  on public.documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own document"
  on public.documents for delete
  using (auth.uid() = user_id);
