-- Contact phone numbers are optional at the database level only so existing
-- accounts can complete the required setup at their next authenticated sign-in.
-- The application requires a valid number before it grants access.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_phone_e164;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_e164
  CHECK (phone IS NULL OR phone ~ '^\\+[1-9][0-9]{7,14}$');

COMMENT ON COLUMN public.profiles.phone IS
  'Required contact number after sign-in, normalized to E.164. Not used as an authentication factor.';
