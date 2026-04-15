-- Add return_date to transactions for common-category repayment tracking
-- Safe to run multiple times

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS return_date DATE;
