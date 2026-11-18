NARU STORES — WEBSITE STARTER
================================

WHAT IS INCLUDED
- Sign-up and login gate (users cannot see marketplace pages before signing in)
- Product upload with image storage
- Product browsing and sharing
- One unique like per signed-in user per product
- $1.00 reward credit to the product owner for each unique like
- Econet and NetOne airtime withdrawal request form
- Wallet balance and withdrawal request history
- Supabase database schema and Row Level Security policies

IMPORTANT ABOUT AIRTIME
This ZIP does NOT send airtime automatically. A phone number alone cannot send airtime.
Automatic Econet/NetOne delivery requires an authorized airtime API/provider, credentials,
a funded merchant account, and a server-side integration. Do not put provider secrets in
app.js or expose them in the browser. Until that integration exists, withdrawal requests
are recorded as PENDING for the site operator to fulfil manually. Do not advertise that
airtime is automatically sent until a real provider integration has been tested.

SETUP
1. Create a Supabase project at https://supabase.com/
2. In Supabase, open SQL Editor and run the complete setup.sql file.
3. In Supabase Storage, create a bucket named product-images and make it PUBLIC.
   (The SQL file also adds upload/read/delete policies.)
4. In Supabase Project Settings > API, copy:
   - Project URL
   - anon / publishable public key
5. Open app.js and replace:
   PASTE_YOUR_SUPABASE_PROJECT_URL_HERE
   PASTE_YOUR_SUPABASE_ANON_PUBLIC_KEY_HERE
6. Save the file.
7. Upload the contents of this ZIP to a static host such as GitHub Pages, Netlify,
   or Vercel. Do not upload the ZIP itself as the website source; extract it first.
8. In Supabase Authentication > URL Configuration, set your deployed website URL
   as the Site URL. Add the deployed URL to Redirect URLs.
9. Test account creation, email confirmation (if enabled), login, image upload,
   likes from a second account, wallet credit, and withdrawal request.

SECURITY NOTES
- Never put the Supabase service_role key in this website.
- Only use the anon/publishable key in app.js.
- Like rewards are credited once per account per product by a database function.
- This starter does not include an admin web panel or an airtime provider connection.
- Public product listings require login in this app. Product image URLs are public so
  they can display in the signed-in marketplace.
- Consider adding moderation, rate limits, spam detection, and business/legal review
  before opening the marketplace to the public.

FILES
index.html   Main website
style.css    Responsive styling
app.js       Supabase-connected website logic
setup.sql    Database tables, policies, and secure database functions
