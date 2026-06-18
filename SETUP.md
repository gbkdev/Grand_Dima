# Grand Dima Hotel — Setup Guide

## 1. Run the database schema

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. Go to **SQL Editor** → **New query**
3. Paste and run the full contents of `supabase-schema.sql`

This creates all tables, security policies, and sample room/menu data.

## 2. Create a manager account

1. In Supabase, go to **Authentication** → **Users** → **Add user**
2. Enter the manager email and password
3. Copy the new user's **UUID**
4. Run this in the SQL Editor (replace the UUID and name):

```sql
insert into public.staff (user_id, full_name, role)
values ('YOUR-USER-UUID-HERE', 'Hotel Manager', 'manager');
```

## 3. Open the website

- Public site: open `index.html` (use Live Server or any static host)
- Admin panel: open `admin.html` and sign in with the manager account

## What the manager can control

| Admin section | Actions |
|---------------|---------|
| Overview | Live KPIs, recent bookings, weekly chart |
| Bookings | View, create, edit, change status, delete |
| Restaurant | Manage table reservations and status |
| Messages | Read contact form submissions, mark as read |
| Newsletter | View and manage subscribers |
| Room Types | Edit prices, descriptions, images shown on the website |
| Room Units | Track room numbers and availability status |
| Menu Items | Manage restaurant menus shown to guests |

## Public site features connected to Supabase

- Room catalog loads from `room_types`
- Booking form saves to `bookings`
- Restaurant reservations save to `restaurant_reservations`
- Contact form saves to `contact_messages`
- Newsletter saves to `newsletter_subscribers`
- Menu modal loads from `menu_items`

## Security

- The publishable key in `supabase-config.js` is safe for the frontend
- Never put your **secret/service role** key in these files
- Only users listed in the `staff` table can access the admin panel
