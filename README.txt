FAT TIGER — CUSTOMER WEBSITE + OWNER DASHBOARD
================================================

WHAT'S INCLUDED
- index.html: customer-facing menu, cart and checkout
- admin.html: owner dashboard for new orders, order status, menu prices, item availability, store on/off
- config.js: Supabase project URL and public anon key
- supabase-setup.sql: database schema and security policies
- manifest + service worker + app icons from the existing FAT TIGER PWA

IMPORTANT
The website files are free to host. To make menu edits and orders sync online between customer and owner devices, connect a free Supabase project. It is not live/connected until the setup below is complete. Existing menu in the customer page is preserved as the preview menu, but import/verify every menu item and price against your PDF before accepting orders.

SETUP (FREE STARTER)
1. Create a project at https://supabase.com and wait for it to finish provisioning.
2. Open Project Settings > API (or Connect), copy the Project URL and public anon/publishable key.
3. Edit config.js and paste those values into SUPABASE_URL and SUPABASE_ANON_KEY.
4. In Supabase > SQL Editor, run all contents of supabase-setup.sql.
5. In Supabase > Authentication > Users, create the owner login with email/password.
6. Copy the owner's user UUID. Run this in SQL Editor, replacing the placeholder:
   insert into public.admin_users(user_id) values ('PASTE-OWNER-USER-UUID-HERE');
7. Disable public sign-ups in Authentication settings.
8. Add menu items in the dashboard, or import menu items in Supabase Table Editor. Prices should be checked against the original menu PDF.
9. Deploy the entire fat-tiger-app folder to Netlify: https://app.netlify.com/drop
10. Open your deployed URL, then add /admin.html for the owner dashboard. Test an order from another browser/device and confirm it appears in dashboard.

OWNER URL
https://YOUR-SITE.netlify.app/admin.html

HOW IT WORKS
- Customers see available menu items and can place cash-on-delivery/pickup orders.
- Owner dashboard shows orders and allows status changes.
- Owner can edit item name/category/price, toggle individual items, and pause/reopen the store.
- The site does not yet include online payment, delivery fee calculation, automatic WhatsApp notifications, or authenticated customer accounts.
- To keep the order database safe, admin permissions are restricted to user IDs listed in admin_users. Never put a Supabase service_role key in browser files.

NOTE ABOUT STORE ON/OFF
The dashboard currently saves store_open status in the database. To make the customer site block checkout while the store is closed, check the store status before allowing checkout; this should be verified in final testing before live use.

MENU ACCURACY
The old customer menu is preserved as a fallback preview. When Supabase contains menu_items, the live database replaces the fallback menu. Verify/import the complete menu from "new updated menu jolly grant.pdf" before going live; do not assume the sample/fallback list is a complete transcription.
