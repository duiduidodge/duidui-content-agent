-- ============================================================
--  Content Agent System — Supabase Schema
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- 1. RAW CONTENT  (Agent 1 writes here)
-- ─────────────────────────────────────────────────────────────
create table if not exists raw_content (
  id               uuid primary key default uuid_generate_v4(),
  source           text not null,          -- 'rss' | 'reddit' | 'hackernews' | 'twitter'
  source_url       text,
  title            text,
  body             text,
  author           text,
  category         text,                   -- e.g. 'AI', 'Design', 'Business'
  tags             text[],
  relevance_score  numeric(4,2) default 0, -- 0-10, scored by Claude
  novelty_score    numeric(4,2) default 0, -- 0-10, scored by Claude
  sentiment        text,                   -- 'positive' | 'neutral' | 'negative'
  key_insights     text[],                 -- bullet insights extracted by Claude
  fetched_at       timestamptz default now(),
  processed        boolean default false,
  processing_error text
);

create index if not exists raw_content_processed_idx on raw_content(processed);
create index if not exists raw_content_source_idx    on raw_content(source);
create index if not exists raw_content_fetched_at_idx on raw_content(fetched_at desc);

-- ─────────────────────────────────────────────────────────────
-- 2. GENERATED CONTENT  (Agent 2 writes here)
-- ─────────────────────────────────────────────────────────────
create type content_platform as enum ('twitter_thread', 'blog_article');
create type content_status   as enum ('draft', 'approved', 'published', 'rejected');

create table if not exists generated_content (
  id              uuid primary key default uuid_generate_v4(),
  raw_content_id  uuid references raw_content(id) on delete set null,
  platform        content_platform not null,
  title           text,                    -- for blog articles
  body            text not null,
  hook            text,                    -- opening hook / first tweet
  tags            text[],
  status          content_status default 'draft',
  impact_score    numeric(4,2),            -- score that triggered generation
  created_at      timestamptz default now(),
  published_at    timestamptz,
  rejection_note  text
);

create index if not exists gen_content_status_idx   on generated_content(status);
create index if not exists gen_content_platform_idx on generated_content(platform);
create index if not exists gen_content_created_at_idx on generated_content(created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 3. PIPELINE RUNS  (for dashboard activity log)
-- ─────────────────────────────────────────────────────────────
create type agent_name   as enum ('researcher', 'creator');
create type run_status   as enum ('running', 'success', 'failed');

create table if not exists pipeline_runs (
  id             uuid primary key default uuid_generate_v4(),
  agent          agent_name not null,
  status         run_status not null default 'running',
  items_fetched  integer default 0,
  items_created  integer default 0,
  error_message  text,
  started_at     timestamptz default now(),
  finished_at    timestamptz,
  duration_ms    integer
);

create index if not exists pipeline_runs_agent_idx on pipeline_runs(agent);
create index if not exists pipeline_runs_started_at_idx on pipeline_runs(started_at desc);

-- ─────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY  (enable for production)
-- ─────────────────────────────────────────────────────────────
alter table raw_content       enable row level security;
alter table generated_content enable row level security;
alter table pipeline_runs     enable row level security;

-- Allow service role full access (used by agents via SUPABASE_SERVICE_KEY)
create policy "service role full access" on raw_content
  for all using (auth.role() = 'service_role');

create policy "service role full access" on generated_content
  for all using (auth.role() = 'service_role');

create policy "service role full access" on pipeline_runs
  for all using (auth.role() = 'service_role');
