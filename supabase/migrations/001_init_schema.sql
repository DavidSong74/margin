-- ============================================================
-- Margin — Initial Schema
-- Apply via: Supabase Dashboard → SQL Editor → paste and run
-- Or: supabase db reset (after linking project with CLI)
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── journals ──────────────────────────────────────────────
create table journals (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users on delete cascade not null,
  title           text not null,
  cover_style     text not null check (cover_style in ('solid', 'image')),
  cover_color     text,
  cover_image_url text,
  created_at      timestamptz default now() not null
);

create index on journals (user_id);

alter table journals enable row level security;

create policy "journals: select own"
  on journals for select using (auth.uid() = user_id);
create policy "journals: insert own"
  on journals for insert with check (auth.uid() = user_id);
create policy "journals: update own"
  on journals for update using (auth.uid() = user_id);
create policy "journals: delete own"
  on journals for delete using (auth.uid() = user_id);


-- ── pages ─────────────────────────────────────────────────
create table pages (
  id                    uuid primary key default uuid_generate_v4(),
  journal_id            uuid references journals on delete cascade not null,
  page_number           integer not null,
  image_path            text not null,       -- storage path (never signed URL)
  thumbnail_path        text,                -- compressed thumbnail storage path
  transcription_text    text,
  transcription_status  text not null default 'pending'
    check (transcription_status in ('pending', 'processing', 'done', 'failed')),
  pending_corrections   jsonb not null default '[]',
  correction_count      integer not null default 0,
  resurfaced_at         timestamptz,
  created_at            timestamptz default now() not null,
  unique (journal_id, page_number)
);

create index on pages (journal_id);

alter table pages enable row level security;

-- Pages RLS joins through journals to check user_id
create policy "pages: select own"
  on pages for select
  using (exists (
    select 1 from journals
    where journals.id = pages.journal_id and journals.user_id = auth.uid()
  ));
create policy "pages: insert own"
  on pages for insert
  with check (exists (
    select 1 from journals
    where journals.id = pages.journal_id and journals.user_id = auth.uid()
  ));
create policy "pages: update own"
  on pages for update
  using (exists (
    select 1 from journals
    where journals.id = pages.journal_id and journals.user_id = auth.uid()
  ));
create policy "pages: delete own"
  on pages for delete
  using (exists (
    select 1 from journals
    where journals.id = pages.journal_id and journals.user_id = auth.uid()
  ));


-- ── corrections ───────────────────────────────────────────
create table corrections (
  id             uuid primary key default uuid_generate_v4(),
  page_id        uuid references pages on delete cascade not null,
  original_word  text not null,
  corrected_word text not null,
  created_at     timestamptz default now() not null
);

create index on corrections (page_id);

alter table corrections enable row level security;

create policy "corrections: select own"
  on corrections for select
  using (exists (
    select 1 from pages p
    join journals j on j.id = p.journal_id
    where p.id = corrections.page_id and j.user_id = auth.uid()
  ));
create policy "corrections: insert own"
  on corrections for insert
  with check (exists (
    select 1 from pages p
    join journals j on j.id = p.journal_id
    where p.id = corrections.page_id and j.user_id = auth.uid()
  ));


-- ── glossary ──────────────────────────────────────────────
create table glossary (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid references auth.users on delete cascade not null,
  original_word  text not null,
  corrected_word text not null,
  updated_at     timestamptz default now() not null,
  unique (user_id, original_word)
);

alter table glossary enable row level security;

create policy "glossary: select own"
  on glossary for select using (auth.uid() = user_id);
create policy "glossary: insert own"
  on glossary for insert with check (auth.uid() = user_id);
create policy "glossary: update own"
  on glossary for update using (auth.uid() = user_id);
create policy "glossary: delete own"
  on glossary for delete using (auth.uid() = user_id);


-- ── save_correction RPC ───────────────────────────────────
-- Atomically writes to both corrections and glossary.
-- Called from the mobile app when a user approves an edit.
create or replace function save_correction(
  p_page_id   uuid,
  p_original  text,
  p_corrected text,
  p_user_id   uuid
) returns void language plpgsql security definer as $$
begin
  insert into corrections (page_id, original_word, corrected_word)
    values (p_page_id, p_original, p_corrected);

  insert into glossary (user_id, original_word, corrected_word, updated_at)
    values (p_user_id, p_original, p_corrected, now())
    on conflict (user_id, original_word)
    do update set corrected_word = excluded.corrected_word, updated_at = now();
end;
$$;


-- ── Storage buckets ────────────────────────────────────────
-- Create via Supabase Dashboard → Storage → New bucket
--   Name: journal_pages   Private: true
--   Name: covers          Private: true
-- Then run the policies below.

-- journal_pages bucket policies
create policy "journal_pages: insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'journal_pages' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "journal_pages: select own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'journal_pages' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "journal_pages: delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'journal_pages' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- covers bucket policies
create policy "covers: insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'covers' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "covers: select own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'covers' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "covers: delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'covers' and
    auth.uid()::text = (storage.foldername(name))[1]
  );
