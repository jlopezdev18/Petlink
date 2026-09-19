ALTER TABLE public.medications
    ADD COLUMN IF NOT EXISTS dose_interval_hours INTEGER,
    ADD COLUMN IF NOT EXISTS next_dose_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_medications_due_dose
    ON public.medications (next_dose_at)
    WHERE is_active = TRUE AND next_dose_at IS NOT NULL;
