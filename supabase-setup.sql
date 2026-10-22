-- FAT TIGER online ordering database (Supabase / PostgreSQL)
-- Run all of this in Supabase Dashboard > SQL Editor > New query.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  section text,
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  customer_address text not null,
  payment_method text not null default 'Cash on delivery / pickup',
  items jsonb not null,
  total_amount numeric(10,2) not null check (total_amount >= 0),
  status text not null default 'New' check (status in ('New','Accepted','Preparing','Ready','Completed','Cancelled')),
  created_at timestamptz not null default now()
);
create table if not exists public.store_settings (
  id integer primary key check (id=1),
  store_open boolean not null default true
);
insert into public.store_settings(id,store_open) values (1,true) on conflict (id) do nothing;

alter table public.admin_users enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.store_settings enable row level security;

create or replace function public.is_ft_admin() returns boolean
language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.admin_users where user_id=auth.uid()); $$;

drop policy if exists "Public can view available menu" on public.menu_items;
create policy "Public can view available menu" on public.menu_items for select to anon, authenticated using (available or public.is_ft_admin());
drop policy if exists "Admins manage menu" on public.menu_items;
create policy "Admins manage menu" on public.menu_items for all to authenticated using (public.is_ft_admin()) with check (public.is_ft_admin());

drop policy if exists "Customers can submit orders" on public.orders;
create policy "Customers can submit orders" on public.orders for insert to anon, authenticated with check (status='New');
drop policy if exists "Admins read orders" on public.orders;
create policy "Admins read orders" on public.orders for select to authenticated using (public.is_ft_admin());
drop policy if exists "Admins update orders" on public.orders;
create policy "Admins update orders" on public.orders for update to authenticated using (public.is_ft_admin()) with check (public.is_ft_admin());

drop policy if exists "Public can read store status" on public.store_settings;
create policy "Public can read store status" on public.store_settings for select to anon, authenticated using (true);
drop policy if exists "Admins update store status" on public.store_settings;
create policy "Admins update store status" on public.store_settings for update to authenticated using (public.is_ft_admin()) with check (public.is_ft_admin());

-- SECURITY NOTE:
-- 1) Create the owner in Supabase > Authentication > Users > Add user.
-- 2) Copy that user's UUID and run:
-- insert into public.admin_users(user_id) values ('PASTE-OWNER-USER-UUID-HERE');
-- 3) Disable public sign-ups in Authentication settings.
-- 4) This starter accepts order submissions without online payment. Add a trusted payment provider later.
-- 5) Do not expose the service_role key in config.js.
