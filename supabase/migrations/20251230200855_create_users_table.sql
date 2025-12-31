-- Create users table that extends auth.users with application-specific fields
CREATE TABLE IF NOT EXISTS public.users (
  -- Primary key matches auth.users id
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Profile information
  email VARCHAR(320) NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_url TEXT,

  -- Admin and permissions
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,

  -- Stripe integration
  stripe_customer_id VARCHAR(255) UNIQUE, -- Stripe Customer ID (for purchases)

  -- Terms acceptance
  accepted_terms_of_service BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_terms_at TIMESTAMP WITH TIME ZONE,

  -- Account status
  blocked_at TIMESTAMP WITH TIME ZONE,

  -- Metadata (JSONB for flexible data storage like signup attribution)
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create index on email for faster lookups (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON public.users (LOWER(email));

-- Create index on stripe_customer_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON public.users (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Create index on deleted_at for soft delete queries
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON public.users (deleted_at) WHERE deleted_at IS NULL;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to handle new user creation from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, email_verified, avatar_url, meta)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.email_confirmed_at IS NOT NULL,
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create user profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to sync user updates from auth.users to public.users
CREATE OR REPLACE FUNCTION public.handle_user_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.users
  SET
    email = NEW.email,
    email_verified = NEW.email_confirmed_at IS NOT NULL,
    avatar_url = COALESCE(NEW.raw_user_meta_data->>'avatar_url', avatar_url),
    updated_at = NOW()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to sync updates from auth.users
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_update();

-- Add helpful comments
COMMENT ON TABLE public.users IS 'Application-specific user profile data that extends auth.users';
COMMENT ON COLUMN public.users.meta IS 'JSONB field for storing flexible metadata like signup attribution, UTM params, etc.';
COMMENT ON COLUMN public.users.stripe_customer_id IS 'Stripe Customer ID for when user makes purchases (not Stripe Connect)';
