# PetLink Supabase Schema

This folder contains the first database schema for PetLink.

## Tables

- `profiles`: app profile for each Supabase Auth user.
- `pets`: pets owned by a user.
- `pet_caregivers`: authorized caregiver access for a pet.
- `medications`: active or historical medications for a pet.
- `prescriptions`: owner-only digital prescriptions uploaded as PDF or image.
- `medication_logs`: scheduled/given/skipped medication events.
- `medical_records`: vaccines, vet visits, surgeries, allergies, conditions, labs, and other history.
- `reminders`: generic due dates for medication, vaccines, vet visits, grooming, or other tasks.
- `pet_documents`: metadata for files stored in the private `pet-files` Storage bucket.

## Access Model

Supabase Auth owns login and passwords in `auth.users`.

Every pet has one owner in `pets.owner_id`.

Profiles store the user's email copied from Supabase Auth so the app can find registered caregivers by exact email.

Owners can authorize caregivers in `pet_caregivers`. A caregiver must also have a row in `profiles`, so they must already be a registered Supabase Auth user.

Caregiver permissions are stored per pet:

- `can_view_pet`: can see the pet profile.
- `can_update_pet`: can edit basic pet information.
- `can_view_medications`: can see medications and medication logs.
- `can_manage_medications`: can create/update medication plans and logs.
- `can_view_records`: can see medical records and documents.
- `can_manage_records`: can create/update medical records and documents.
- `can_manage_reminders`: can create/update reminders.

Owners can manage caregiver rows. Caregivers can read their own caregiver assignments and remove themselves.

Digital prescriptions are private to the pet owner in v1. Caregivers can manage medications according to their preset, but they cannot view or manage prescriptions.

Files should be uploaded to paths starting with the user's id:

```text
{user_id}/{pet_id}/{filename}
```

That path shape is required by the Storage RLS policies.

When a file is linked through `pet_documents.file_path`, owners and caregivers with record access can read it according to the pet permissions.

## How To Apply

Open your Supabase project dashboard:

1. Go to SQL Editor.
2. Open `schema.sql`.
3. Paste and run the whole file.
4. Check Database > Tables and Storage > Buckets.

If your project has strict Data API exposure settings, make sure the `public` schema tables are exposed to the Data API after running the SQL.

## Create A Test User

Use the Dashboard, not direct SQL into `auth.users`.

1. Go to Authentication > Users.
2. Click Add user.
3. Choose Create new user.
4. Enter the test email.
5. Enter the test password.
6. Enable Auto Confirm User so the account can log in immediately.
7. Click Create user.

The `on_auth_user_created` trigger in `schema.sql` creates the matching row in `profiles` automatically.

## Next Step

After this schema is mounted, configure these frontend environment values:

```ts
supabaseUrl: 'https://uimxlgudpxdtbkujngxh.supabase.co',
supabaseAnonKey: 'your-publishable-or-anon-key',
```

Never put the service role key in the frontend.
