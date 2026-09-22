CREATE TABLE IF NOT EXISTS public.pet_qr_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id UUID NOT NULL,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{32,64}$'),
    is_lost BOOLEAN NOT NULL DEFAULT FALSE,
    lost_message TEXT CHECK (lost_message IS NULL OR char_length(lost_message) <= 500),
    show_owner_phone BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (pet_id),
    FOREIGN KEY (pet_id, owner_id) REFERENCES public.pets(id, owner_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.pet_sighting_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_tag_id UUID NOT NULL REFERENCES public.pet_qr_tags(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
    reporter_name TEXT CHECK (reporter_name IS NULL OR char_length(reporter_name) <= 100),
    reporter_phone TEXT CHECK (reporter_phone IS NULL OR char_length(reporter_phone) <= 30),
    message TEXT NOT NULL CHECK (char_length(message) BETWEEN 5 AND 1000),
    location_description TEXT CHECK (
        location_description IS NULL OR char_length(location_description) <= 300
    ),
    latitude NUMERIC(9, 6) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    longitude NUMERIC(9, 6) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    accuracy_meters NUMERIC(10, 2) CHECK (
        accuracy_meters IS NULL OR accuracy_meters BETWEEN 0 AND 100000
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CHECK (accuracy_meters IS NULL OR latitude IS NOT NULL)
);

ALTER TABLE public.pet_qr_tags
    ADD COLUMN IF NOT EXISTS show_owner_phone BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO public.pet_qr_tags (pet_id, owner_id, token)
SELECT pets.id, pets.owner_id, replace(gen_random_uuid()::text, '-', '')
FROM public.pets
ON CONFLICT (pet_id) DO NOTHING;

DROP TRIGGER IF EXISTS set_pet_qr_tags_updated_at ON public.pet_qr_tags;
CREATE TRIGGER set_pet_qr_tags_updated_at
BEFORE UPDATE ON public.pet_qr_tags
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_pet_sighting_reports_updated_at ON public.pet_sighting_reports;
CREATE TRIGGER set_pet_sighting_reports_updated_at
BEFORE UPDATE ON public.pet_sighting_reports
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS pet_qr_tags_owner_id_idx ON public.pet_qr_tags(owner_id);
CREATE INDEX IF NOT EXISTS pet_sighting_reports_qr_tag_status_created_idx
    ON public.pet_sighting_reports(qr_tag_id, status, created_at DESC);

ALTER TABLE public.pet_qr_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_sighting_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pet_qr_tags FROM anon;
REVOKE ALL ON TABLE public.pet_sighting_reports FROM anon;
REVOKE ALL ON TABLE public.pet_qr_tags FROM authenticated;
REVOKE ALL ON TABLE public.pet_sighting_reports FROM authenticated;
GRANT SELECT, INSERT ON public.pet_qr_tags TO authenticated;
GRANT UPDATE (is_lost, lost_message, show_owner_phone) ON public.pet_qr_tags TO authenticated;
GRANT SELECT ON public.pet_sighting_reports TO authenticated;
GRANT UPDATE (status) ON public.pet_sighting_reports TO authenticated;

DROP POLICY IF EXISTS "pet_qr_tags_select_owner" ON public.pet_qr_tags;
CREATE POLICY "pet_qr_tags_select_owner"
ON public.pet_qr_tags FOR SELECT TO authenticated
USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "pet_qr_tags_insert_owner" ON public.pet_qr_tags;
CREATE POLICY "pet_qr_tags_insert_owner"
ON public.pet_qr_tags FOR INSERT TO authenticated
WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.pets
        WHERE pets.id = pet_qr_tags.pet_id
          AND pets.owner_id = (SELECT auth.uid())
    )
);

DROP POLICY IF EXISTS "pet_qr_tags_update_owner" ON public.pet_qr_tags;
CREATE POLICY "pet_qr_tags_update_owner"
ON public.pet_qr_tags FOR UPDATE TO authenticated
USING (owner_id = (SELECT auth.uid()))
WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "pet_qr_tags_delete_owner" ON public.pet_qr_tags;
CREATE POLICY "pet_qr_tags_delete_owner"
ON public.pet_qr_tags FOR DELETE TO authenticated
USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "pet_sighting_reports_select_owner" ON public.pet_sighting_reports;
CREATE POLICY "pet_sighting_reports_select_owner"
ON public.pet_sighting_reports FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.pet_qr_tags
        WHERE pet_qr_tags.id = pet_sighting_reports.qr_tag_id
          AND pet_qr_tags.owner_id = (SELECT auth.uid())
    )
);

DROP POLICY IF EXISTS "pet_sighting_reports_update_owner" ON public.pet_sighting_reports;
CREATE POLICY "pet_sighting_reports_update_owner"
ON public.pet_sighting_reports FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.pet_qr_tags
        WHERE pet_qr_tags.id = pet_sighting_reports.qr_tag_id
          AND pet_qr_tags.owner_id = (SELECT auth.uid())
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.pet_qr_tags
        WHERE pet_qr_tags.id = pet_sighting_reports.qr_tag_id
          AND pet_qr_tags.owner_id = (SELECT auth.uid())
    )
);

DROP POLICY IF EXISTS "pet_sighting_reports_delete_owner" ON public.pet_sighting_reports;
CREATE POLICY "pet_sighting_reports_delete_owner"
ON public.pet_sighting_reports FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.pet_qr_tags
        WHERE pet_qr_tags.id = pet_sighting_reports.qr_tag_id
          AND pet_qr_tags.owner_id = (SELECT auth.uid())
    )
);
