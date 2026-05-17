-- ════════════════════════════════════════════════════════
--  ПРОЯВ · Supabase SQL Schema
--  Запустити в Supabase → SQL Editor → New query
-- ════════════════════════════════════════════════════════

-- ── Photographers ────────────────────────────────────────
create table if not exists photographers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  email          text not null unique,
  password_hash  text not null,
  phone          text,
  city           text,
  commission_pct integer not null default 12,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ── Orders ───────────────────────────────────────────────
create table if not exists orders (
  id               uuid primary key default gen_random_uuid(),

  -- Magic link token: 8 random chars, unique
  token            text not null unique default lower(substring(replace(gen_random_uuid()::text,'-','') from 1 for 8)),

  -- Client info
  client_name      text not null,
  client_phone     text not null,
  client_instagram text,

  -- Product
  product_type     text not null default 'small'
                   check (product_type in ('small','medium','large','baby')),

  -- Relations
  photographer_id  uuid references photographers(id) on delete set null,
  source           text not null default 'retail'
                   check (source in ('photographer','retail')),

  -- Status flow: new → uploaded → in_progress → sent → paid
  status           text not null default 'new'
                   check (status in ('new','uploaded','in_progress','sent','paid')),

  -- Order details (filled after client uploads)
  photo_count      integer,
  qty_total        integer,
  total_amount     integer,

  -- Delivery
  ttn              text,    -- Nova Poshta tracking number
  notes            text,

  -- Timestamps
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '72 hours'),
  uploaded_at      timestamptz
);

-- ── Indexes ──────────────────────────────────────────────
create index if not exists idx_orders_token           on orders(token);
create index if not exists idx_orders_status          on orders(status);
create index if not exists idx_orders_photographer_id on orders(photographer_id);
create index if not exists idx_orders_created_at      on orders(created_at desc);

-- ── Row Level Security ────────────────────────────────────
-- We use service key in Netlify Functions (bypasses RLS)
-- RLS is ON but only service key can access — extra safety layer
alter table photographers enable row level security;
alter table orders enable row level security;

-- No public policies — all access via service key in functions only

-- ════════════════════════════════════════════════════════
--  ПЕРЕВІРКА: після запуску має повернути 0 рядків (порожні таблиці)
-- ════════════════════════════════════════════════════════
-- select count(*) from photographers;
-- select count(*) from orders;
