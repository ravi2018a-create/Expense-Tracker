-- Add user_categories table to existing Supabase schema
-- Run this ONLY if you get "relation already exists" error
-- This adds just the missing user_categories table

-- Create user_categories table for custom categories
CREATE TABLE public.user_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  categories_json TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE public.user_categories ENABLE ROW LEVEL SECURITY;

-- Policies for user_categories table
CREATE POLICY "Users can view own categories" ON public.user_categories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own categories" ON public.user_categories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories" ON public.user_categories
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own categories" ON public.user_categories
  FOR DELETE USING (auth.uid() = user_id);