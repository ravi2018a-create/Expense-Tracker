# 🚀 Supabase Backend Setup Instructions

## Step 1: Create Supabase Project
1. Go to https://supabase.com
2. Click "Start your project"
3. Sign in with GitHub
4. Click "New Project"
5. Choose organization
6. Enter project details:
   - **Name**: `expense-tracker`
   - **Database Password**: (generate strong password)
   - **Region**: Choose closest to your users

## Step 2: Set up Database Schema
1. Go to your Supabase dashboard
2. Click "SQL Editor" in the sidebar
3. Create a new query
4. Copy and paste the contents of `supabase-schema.sql`
5. Click "Run" to execute the schema

## Step 3: Get Your Credentials
1. Go to "Settings" > "API"
2. Copy your **Project URL** 
3. Copy your **anon public** key
4. Replace the values in `script.js`:
   ```javascript
   const SUPABASE_URL = 'your-project-url-here';
   const SUPABASE_ANON_KEY = 'your-anon-key-here';
   ```

## Step 4: Configure Email Authentication
1. Go to "Authentication" > "Settings"
2. Under "Auth Providers" enable Email
3. Configure email templates (optional)
4. Set up SMTP (optional, for custom emails)

## Step 5: Test Your Setup
1. Deploy your updated code
2. Try creating a new account
3. Add some expenses
4. Sign out and sign back in
5. Verify data persistence

## Features Enabled:
✅ **Real Database Storage** - PostgreSQL
✅ **Multi-User Support** - Each user has isolated data
✅ **Cross-Device Access** - Login from anywhere
✅ **Real-time Sync** - Changes sync instantly
✅ **Data Security** - Row Level Security enabled
✅ **Email Authentication** - Secure signup/signin
✅ **Persistent Storage** - Data never lost
✅ **Scalable** - Handles unlimited users

## Free Tier Limits:
- 50,000 monthly active users
- 500MB database storage
- 2GB bandwidth
- Should be more than enough for personal/small business use

Your expense tracker now has enterprise-level backend infrastructure! 🎉