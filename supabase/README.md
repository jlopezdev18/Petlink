# PetLink Supabase Schema

This folder contains the first database schema for PetLink.

## Tables

- `profiles`: app profile for each Supabase Auth user.
- `pets`: pets owned by a user.
- `pet_caregivers`: authorized caregiver access for a pet.
- `pet_access_codes`: temporary guest access codes for caregivers who do not register.
- `pet_qr_tags`: one permanent public QR token and owner-controlled lost/contact settings per pet.
- `pet_sighting_reports`: finder reports, optional contact details, and optional GPS coordinates submitted through FastAPI.
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
Profiles also store `account_type` as `owner` or `caregiver` to tailor the login and registration experience. This does not limit caregiver authorization: any registered profile can still be authorized as a caregiver by email.

Owners can authorize caregivers in `pet_caregivers`. A caregiver must also have a row in `profiles`, so they must already be a registered Supabase Auth user.

Owners can also create temporary guest codes in `pet_access_codes`. Codes are stored as hashes, can be revoked, and expire at the owner-selected time. Guest code access is intentionally narrower than registered caregiver access: guests can view the authorized pet and active medications, then mark a medication as given through the backend API.

Permanent pet QR tokens do not expire and are backfilled for existing pets. Public QR lookup and report submission go through FastAPI; the new tables do not grant direct `anon` Data API access. Authenticated owners can read their rows under RLS, while column grants prevent changing permanent tokens or report content through the Data API.

Caregiver permissions are stored per pet:

- `can_view_pet`: can see the pet profile.
- `can_update_pet`: can edit basic pet information.
- `can_view_medications`: can see medications and medication logs.
- `can_manage_medications`: can create/update medication plans and logs.
- `can_view_records`: can see medical records and documents.
- `can_manage_records`: can create/update medical records and documents.
- `can_manage_reminders`: can create/update reminders.

Owners can manage caregiver rows. Caregivers can read their own caregiver assignments and remove themselves.

Digital prescriptions are private to the pet owner in v1. Registered caregivers can view medication schedules, but they cannot manage medications or view prescriptions.

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
