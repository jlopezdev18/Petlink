UPDATE public.pet_caregivers
SET
    role = 'caregiver',
    can_view_pet = TRUE,
    can_update_pet = FALSE,
    can_view_medications = TRUE,
    can_manage_medications = FALSE,
    can_view_records = FALSE,
    can_manage_records = FALSE,
    can_manage_reminders = FALSE,
    updated_at = now()
WHERE role = 'other';
