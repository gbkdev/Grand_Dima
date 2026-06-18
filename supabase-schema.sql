-- Grand Dima Hotel — Full database schema
-- Run in Supabase Dashboard → SQL Editor

create extension if not exists "pgcrypto";

-- ===== CORE TABLES =====

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  check_in date not null,
  check_out date not null,
  guests text not null,
  room_type text not null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  special_requests text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  total_amount numeric(10,2),
  created_at timestamptz not null default now()
);

create table if not exists public.restaurant_reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant text not null,
  reservation_date date not null,
  reservation_time text not null,
  guests text not null,
  guest_name text not null,
  phone text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  subject text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.room_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  size_sqm integer not null,
  max_guests integer not null,
  bed_type text not null,
  price_per_night numeric(10,2) not null,
  amenities text[] not null default '{}',
  image_url text not null,
  badge text,
  badge_type text check (badge_type in ('available', 'limited', 'gold')),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.room_units (
  id uuid primary key default gen_random_uuid(),
  room_number text not null unique,
  room_type_id uuid not null references public.room_types(id) on delete cascade,
  status text not null default 'available' check (status in ('available', 'occupied', 'maintenance', 'cleaning')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant text not null,
  category text not null,
  name text not null,
  price text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'manager' check (role in ('manager', 'reception', 'admin')),
  created_at timestamptz not null default now()
);

-- Add columns if upgrading an existing project
alter table public.contact_messages add column if not exists is_read boolean not null default false;
alter table public.newsletter_subscribers add column if not exists is_active boolean not null default true;
alter table public.bookings add column if not exists total_amount numeric(10,2);

-- ===== STAFF HELPER =====

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff where user_id = auth.uid()
  );
$$;

-- ===== ROW LEVEL SECURITY =====

alter table public.bookings enable row level security;
alter table public.restaurant_reservations enable row level security;
alter table public.contact_messages enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.room_types enable row level security;
alter table public.room_units enable row level security;
alter table public.menu_items enable row level security;
alter table public.staff enable row level security;

-- Drop old policies if re-running
do $$ declare r record; begin
  for r in (
    select policyname, tablename from pg_policies where schemaname = 'public'
  ) loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Public website access
create policy "Public insert bookings" on public.bookings
  for insert to anon, authenticated with check (true);

create policy "Public insert restaurant reservations" on public.restaurant_reservations
  for insert to anon, authenticated with check (true);

create policy "Public insert contact messages" on public.contact_messages
  for insert to anon, authenticated with check (true);

create policy "Public insert newsletter subscribers" on public.newsletter_subscribers
  for insert to anon, authenticated with check (true);

create policy "Public read active room types" on public.room_types
  for select to anon, authenticated using (is_active = true);

create policy "Public read active menu items" on public.menu_items
  for select to anon, authenticated using (is_active = true);

-- Staff full access
create policy "Staff manage bookings" on public.bookings
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Staff manage restaurant reservations" on public.restaurant_reservations
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Staff manage contact messages" on public.contact_messages
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Staff manage newsletter subscribers" on public.newsletter_subscribers
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Staff manage room types" on public.room_types
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Staff manage room units" on public.room_units
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Staff manage menu items" on public.menu_items
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "Staff read staff table" on public.staff
  for select to authenticated using (public.is_staff());

create policy "Staff read own profile" on public.staff
  for select to authenticated using (user_id = auth.uid());

-- ===== SEED DATA =====

insert into public.room_types (slug, name, description, size_sqm, max_guests, bed_type, price_per_night, amenities, image_url, badge, badge_type, sort_order)
values
  ('deluxe', 'Deluxe Room', 'A spacious retreat with city views, a king-size bed, marble bathroom, and curated minibar.', 42, 2, 'King Bed', 185,
   array['Free WiFi', 'Smart TV', 'Rainfall Shower', 'Mini Bar'],
   'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=700&q=80', 'Available', 'available', 1),
  ('junior', 'Junior Suite', 'Separate living area, premium bath products, and a private balcony overlooking Addis Ababa.', 68, 2, 'King Bed', 285,
   array['Free WiFi', 'Living Room', 'Balcony', 'Jacuzzi'],
   'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=700&q=80', 'Available', 'available', 2),
  ('grand', 'Grand Suite', 'Two bedrooms, a formal dining area, and a wraparound terrace with panoramic city vistas.', 105, 4, '2 King Beds', 450,
   array['Butler Service', 'Dining Room', 'Terrace', 'Spa Bath'],
   'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=700&q=80', '2 Left', 'limited', 3),
  ('presidential', 'Presidential Suite', 'The pinnacle of luxury. A private residence in the sky with a dedicated butler, private kitchen, and rooftop access.', 240, 6, 'Master Suite', 1200,
   array['Private Butler', 'Rooftop Access', 'Private Kitchen', 'Home Cinema'],
   'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=700&q=80', 'Signature', 'gold', 4)
on conflict (slug) do nothing;

insert into public.room_units (room_number, room_type_id, status)
select v.room_number, rt.id, v.status
from (values
  ('101', 'deluxe', 'available'),
  ('102', 'deluxe', 'occupied'),
  ('201', 'junior', 'occupied'),
  ('202', 'junior', 'maintenance'),
  ('301', 'grand', 'available'),
  ('P01', 'presidential', 'occupied')
) as v(room_number, slug, status)
join public.room_types rt on rt.slug = v.slug
on conflict (room_number) do nothing;

insert into public.menu_items (restaurant, category, name, price, sort_order)
values
  ('Dima Habesha', 'Starters', 'Tibs Firfir', 'ETB 380', 1),
  ('Dima Habesha', 'Starters', 'Kitfo Royal', 'ETB 520', 2),
  ('Dima Habesha', 'Main Course', 'Doro Wot (Signature)', 'ETB 890', 3),
  ('Dima Habesha', 'Main Course', 'Lamb Tibs Supremo', 'ETB 1,100', 4),
  ('La Maison', 'Entrées', 'Steak Tartare', '$28', 1),
  ('La Maison', 'Plats Principaux', 'Filet de Boeuf Rossini', '$68', 2),
  ('Sky Bar', 'Signature Cocktails', 'The Ethiopian Gold', '$22', 1),
  ('Sky Bar', 'Light Bites', 'Truffle Fries', '$14', 2)
on conflict do nothing;

-- ===== SETUP INSTRUCTIONS =====
-- 1. Supabase Dashboard → Authentication → Users → Add user (manager email + password)
-- 2. Copy the new user's UUID and run:
--    insert into public.staff (user_id, full_name, role)
--    values ('YOUR-USER-UUID-HERE', 'Hotel Manager', 'manager');
