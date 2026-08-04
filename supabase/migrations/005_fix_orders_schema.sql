-- ============================================================================
-- EduSphere v2 -- Fix Orders Table Schema
-- Adds missing columns to match books.ts createOrder function
-- Created: 2026-04-23
-- ============================================================================

-- Add missing columns to orders table
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS user_email TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS full_name TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS order_notes TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS subtotal INTEGER NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
ADD COLUMN IF NOT EXISTS delivery_fee INTEGER NOT NULL DEFAULT 5000 CHECK (delivery_fee >= 0);

-- Update the constraint on total to use subtotal + delivery_fee
-- (The column already exists, so we just ensure data consistency going forward)

-- Update existing records to populate missing fields (if any exist)
UPDATE public.orders
SET delivery_fee = COALESCE(delivery_fee, 5000)
WHERE delivery_fee IS NULL OR delivery_fee = 0;

-- Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_orders_user_email ON public.orders(user_email);
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON public.orders(status, created_at DESC);

-- ============================================================================
-- END OF MIGRATION 005
-- ============================================================================
