-- Create org-assets bucket for organization avatars/logos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-assets',
  'org-assets',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to org-assets
CREATE POLICY "Public read access for org-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'org-assets');

-- Allow service-role (backend) to insert/update/delete
CREATE POLICY "Service role write access for org-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'org-assets');

CREATE POLICY "Service role update access for org-assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'org-assets');

CREATE POLICY "Service role delete access for org-assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'org-assets');
