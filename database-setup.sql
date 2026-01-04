-- User Preferences Table for Expense Tracker
-- Run this SQL in your Supabase SQL Editor to enable theme storage

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    theme VARCHAR(10) DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Create policy for users to manage their own preferences
CREATE POLICY "Users can view their own preferences" ON user_preferences
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences" ON user_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences" ON user_preferences
    FOR UPDATE USING (auth.uid() = user_id);

-- Create function to auto-update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert example data (optional)
-- INSERT INTO user_preferences (user_id, theme) VALUES 
-- (auth.uid(), 'dark') ON CONFLICT (user_id) DO UPDATE SET theme = EXCLUDED.theme;