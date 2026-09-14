-- PetLink initial Supabase schema
-- Run this in the Supabase SQL Editor for your project.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null,
  account_type text not null default 'owner' check (account_type in ('owner', 'caregiver')),
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
add column if not exists email text;

alter table public.profiles
add column if not exists account_type text not null default 'owner';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_account_type_check check (account_type in ('owner', 'caregiver'));
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, account_type)
  values (
    new.id,
    lower(new.email),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Nuevo usuario'
    ),
    coalesce(nullif(new.raw_user_meta_data ->> 'account_type', ''), 'owner')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

update public.profiles
set email = lower(auth_users.email)
from auth.users as auth_users
where profiles.id = auth_users.id
  and profiles.email is distinct from lower(auth_users.email);

create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  species text not null check (
    species in ('dog', 'cat', 'bird', 'rabbit', 'reptile', 'fish', 'other')
  ),
  breed text,
  sex text check (sex in ('male', 'female', 'unknown')),
  birth_date date,
  weight_kg numeric(5, 2) check (weight_kg is null or weight_kg >= 0),
  color text,
  photo_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pets_id_owner_id_unique unique (id, owner_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pets_id_owner_id_unique'
      and conrelid = 'public.pets'::regclass
  ) then
    alter table public.pets
    add constraint pets_id_owner_id_unique unique (id, owner_id);
  end if;
end $$;

create table if not exists public.pet_caregivers (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  caregiver_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'caregiver' check (
    role in ('caregiver', 'family', 'sitter', 'veterinarian', 'other')
  ),
  status text not null default 'accepted' check (
    status in ('pending', 'accepted', 'revoked')
  ),
  can_view_pet boolean not null default true,
  can_update_pet boolean not null default false,
  can_view_medications boolean not null default true,
  can_manage_medications boolean not null default false,
  can_view_records boolean not null default false,
  can_manage_records boolean not null default false,
  can_manage_reminders boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (pet_id, owner_id) references public.pets(id, owner_id) on delete cascade,
  unique (pet_id, caregiver_id),
  check (owner_id <> caregiver_id)
);

create table if not exists public.pet_access_codes (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  code_hash text not null unique,
  purpose text not null default 'caregiver' check (purpose in ('caregiver', 'veterinarian')),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (pet_id, owner_id) references public.pets(id, owner_id) on delete cascade
);

alter table public.pet_access_codes
add column if not exists purpose text not null default 'caregiver';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pet_access_codes_purpose_check'
      and conrelid = 'public.pet_access_codes'::regclass
  ) then
    alter table public.pet_access_codes
    add constraint pet_access_codes_purpose_check check (purpose in ('caregiver', 'veterinarian'));
  end if;
end $$;

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  name text not null,
  dosage text not null,
  frequency text not null,
  start_date date not null default current_date,
  end_date date check (end_date is null or end_date >= start_date),
  prescribing_vet text,
  instructions text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.medication_logs (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications(id) on delete cascade,
  scheduled_for timestamptz not null,
  administered_at timestamptz,
  status text not null default 'scheduled' check (
    status in ('scheduled', 'given', 'skipped', 'missed')
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  medication_id uuid references public.medications(id) on delete set null,
  title text not null,
  prescribed_by text,
  issued_on date not null default current_date,
  notes text,
  bucket_id text not null default 'pet-files',
  file_path text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, file_path),
  foreign key (pet_id, owner_id) references public.pets(id, owner_id) on delete cascade
);

create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  record_type text not null check (
    record_type in ('vaccine', 'vet_visit', 'surgery', 'allergy', 'condition', 'lab', 'other')
  ),
  title text not null,
  occurred_on date not null default current_date,
  provider text,
  notes text,
  next_due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  title text not null,
  reminder_type text not null default 'other' check (
    reminder_type in ('medication', 'vet_visit', 'vaccine', 'grooming', 'other')
  ),
  due_at timestamptz not null,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pet_documents (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  title text not null,
  bucket_id text not null default 'pet-files',
  file_path text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pet_id, file_path)
);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_pets_updated_at on public.pets;
create trigger set_pets_updated_at
before update on public.pets
for each row execute function public.set_updated_at();

drop trigger if exists set_pet_caregivers_updated_at on public.pet_caregivers;
create trigger set_pet_caregivers_updated_at
before update on public.pet_caregivers
for each row execute function public.set_updated_at();

drop trigger if exists set_pet_access_codes_updated_at on public.pet_access_codes;
create trigger set_pet_access_codes_updated_at
before update on public.pet_access_codes
for each row execute function public.set_updated_at();

drop trigger if exists set_medications_updated_at on public.medications;
create trigger set_medications_updated_at
before update on public.medications
for each row execute function public.set_updated_at();

drop trigger if exists set_medication_logs_updated_at on public.medication_logs;
create trigger set_medication_logs_updated_at
before update on public.medication_logs
for each row execute function public.set_updated_at();

drop trigger if exists set_prescriptions_updated_at on public.prescriptions;
create trigger set_prescriptions_updated_at
before update on public.prescriptions
for each row execute function public.set_updated_at();

drop trigger if exists set_medical_records_updated_at on public.medical_records;
create trigger set_medical_records_updated_at
before update on public.medical_records
for each row execute function public.set_updated_at();

drop trigger if exists set_reminders_updated_at on public.reminders;
create trigger set_reminders_updated_at
before update on public.reminders
for each row execute function public.set_updated_at();

drop trigger if exists set_pet_documents_updated_at on public.pet_documents;
create trigger set_pet_documents_updated_at
before update on public.pet_documents
for each row execute function public.set_updated_at();

create index if not exists pets_owner_id_idx on public.pets(owner_id);
create index if not exists profiles_email_lower_idx on public.profiles(lower(email));
create index if not exists pet_caregivers_pet_id_idx on public.pet_caregivers(pet_id);
create index if not exists pet_caregivers_owner_id_idx on public.pet_caregivers(owner_id);
create index if not exists pet_caregivers_caregiver_id_idx on public.pet_caregivers(caregiver_id);
create index if not exists pet_caregivers_accepted_caregiver_idx
  on public.pet_caregivers(caregiver_id, pet_id)
  where status = 'accepted';
create index if not exists pet_access_codes_owner_id_idx on public.pet_access_codes(owner_id);
create index if not exists pet_access_codes_pet_id_idx on public.pet_access_codes(pet_id);
create index if not exists pet_access_codes_active_idx
  on public.pet_access_codes(code_hash, expires_at)
  where revoked_at is null;
create index if not exists medications_pet_id_idx on public.medications(pet_id);
create index if not exists medication_logs_medication_id_idx on public.medication_logs(medication_id);
create index if not exists medication_logs_scheduled_for_idx on public.medication_logs(scheduled_for);
create index if not exists prescriptions_pet_id_idx on public.prescriptions(pet_id);
create index if not exists prescriptions_owner_id_idx on public.prescriptions(owner_id);
create index if not exists prescriptions_medication_id_idx on public.prescriptions(medication_id);
create index if not exists medical_records_pet_id_idx on public.medical_records(pet_id);
create index if not exists medical_records_occurred_on_idx on public.medical_records(occurred_on desc);
create index if not exists reminders_pet_id_idx on public.reminders(pet_id);
create index if not exists reminders_due_at_idx on public.reminders(due_at);
create index if not exists pet_documents_pet_id_idx on public.pet_documents(pet_id);

alter table public.profiles enable row level security;
alter table public.pets enable row level security;
alter table public.pet_caregivers enable row level security;
alter table public.pet_access_codes enable row level security;
alter table public.medications enable row level security;
alter table public.medication_logs enable row level security;
alter table public.prescriptions enable row level security;
alter table public.medical_records enable row level security;
alter table public.reminders enable row level security;
alter table public.pet_documents enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.pets,
  public.pet_caregivers,
  public.pet_access_codes,
  public.medications,
  public.medication_logs,
  public.prescriptions,
  public.medical_records,
  public.reminders,
  public.pet_documents
to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_related" on public.profiles;
create policy "profiles_select_related"
on public.profiles for select
to authenticated
using (
  (select auth.uid()) = id
  or exists (
    select 1
    from public.pet_caregivers
    where pet_caregivers.owner_id = (select auth.uid())
      and pet_caregivers.caregiver_id = profiles.id
  )
  or exists (
    select 1
    from public.pet_caregivers
    where pet_caregivers.caregiver_id = (select auth.uid())
      and pet_caregivers.owner_id = profiles.id
      and pet_caregivers.status = 'accepted'
  )
);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "pet_caregivers_select_participants" on public.pet_caregivers;
create policy "pet_caregivers_select_participants"
on public.pet_caregivers for select
to authenticated
using (
  owner_id = (select auth.uid())
  or caregiver_id = (select auth.uid())
);

drop policy if exists "pet_caregivers_insert_owner" on public.pet_caregivers;
create policy "pet_caregivers_insert_owner"
on public.pet_caregivers for insert
to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "pet_caregivers_update_owner" on public.pet_caregivers;
create policy "pet_caregivers_update_owner"
on public.pet_caregivers for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "pet_caregivers_delete_owner_or_self" on public.pet_caregivers;
create policy "pet_caregivers_delete_owner_or_self"
on public.pet_caregivers for delete
to authenticated
using (
  owner_id = (select auth.uid())
  or caregiver_id = (select auth.uid())
);

drop policy if exists "pet_access_codes_select_owner" on public.pet_access_codes;
create policy "pet_access_codes_select_owner"
on public.pet_access_codes for select
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "pet_access_codes_insert_owner" on public.pet_access_codes;
create policy "pet_access_codes_insert_owner"
on public.pet_access_codes for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.pets
    where pets.id = pet_access_codes.pet_id
      and pets.owner_id = (select auth.uid())
  )
);

drop policy if exists "pet_access_codes_update_owner" on public.pet_access_codes;
create policy "pet_access_codes_update_owner"
on public.pet_access_codes for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "pet_access_codes_delete_owner" on public.pet_access_codes;
create policy "pet_access_codes_delete_owner"
on public.pet_access_codes for delete
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "pets_select_own" on public.pets;
drop policy if exists "pets_select_access" on public.pets;
create policy "pets_select_access"
on public.pets for select
to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1
    from public.pet_caregivers
    where pet_caregivers.pet_id = pets.id
      and pet_caregivers.caregiver_id = (select auth.uid())
      and pet_caregivers.status = 'accepted'
      and pet_caregivers.can_view_pet
  )
);

drop policy if exists "pets_insert_own" on public.pets;
create policy "pets_insert_own"
on public.pets for insert
to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "pets_update_own" on public.pets;
drop policy if exists "pets_update_access" on public.pets;
create policy "pets_update_access"
on public.pets for update
to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1
    from public.pet_caregivers
    where pet_caregivers.pet_id = pets.id
      and pet_caregivers.caregiver_id = (select auth.uid())
      and pet_caregivers.status = 'accepted'
      and pet_caregivers.can_update_pet
  )
)
with check (
  owner_id = (select auth.uid())
  or exists (
    select 1
    from public.pet_caregivers
    where pet_caregivers.pet_id = pets.id
      and pet_caregivers.caregiver_id = (select auth.uid())
      and pet_caregivers.status = 'accepted'
      and pet_caregivers.can_update_pet
  )
);

drop policy if exists "pets_delete_own" on public.pets;
create policy "pets_delete_own"
on public.pets for delete
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "medications_owner_manage" on public.medications;
drop policy if exists "medications_select_access" on public.medications;
create policy "medications_select_access"
on public.medications for select
to authenticated
using (
  exists (
    select 1
    from public.pets
    where pets.id = medications.pet_id
      and (
        pets.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.pet_caregivers
          where pet_caregivers.pet_id = pets.id
            and pet_caregivers.caregiver_id = (select auth.uid())
            and pet_caregivers.status = 'accepted'
            and pet_caregivers.can_view_medications
        )
      )
  )
);

drop policy if exists "medications_manage_access" on public.medications;
create policy "medications_manage_access"
on public.medications for all
to authenticated
using (
  exists (
    select 1
    from public.pets
    where pets.id = medications.pet_id
      and (
        pets.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.pet_caregivers
          where pet_caregivers.pet_id = pets.id
            and pet_caregivers.caregiver_id = (select auth.uid())
            and pet_caregivers.status = 'accepted'
            and pet_caregivers.can_manage_medications
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.pets
    where pets.id = medications.pet_id
      and (
        pets.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.pet_caregivers
          where pet_caregivers.pet_id = pets.id
            and pet_caregivers.caregiver_id = (select auth.uid())
            and pet_caregivers.status = 'accepted'
            and pet_caregivers.can_manage_medications
        )
      )
  )
);

drop policy if exists "medication_logs_owner_manage" on public.medication_logs;
drop policy if exists "medication_logs_select_access" on public.medication_logs;
create policy "medication_logs_select_access"
on public.medication_logs for select
to authenticated
using (
  exists (
    select 1
    from public.medications
    join public.pets on pets.id = medications.pet_id
    where medications.id = medication_logs.medication_id
      and (
        pets.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.pet_caregivers
          where pet_caregivers.pet_id = pets.id
            and pet_caregivers.caregiver_id = (select auth.uid())
            and pet_caregivers.status = 'accepted'
            and pet_caregivers.can_view_medications
        )
      )
  )
);

drop policy if exists "medication_logs_manage_access" on public.medication_logs;
create policy "medication_logs_manage_access"
on public.medication_logs for all
to authenticated
using (
  exists (
    select 1
    from public.medications
    join public.pets on pets.id = medications.pet_id
    where medications.id = medication_logs.medication_id
      and (
        pets.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.pet_caregivers
          where pet_caregivers.pet_id = pets.id
            and pet_caregivers.caregiver_id = (select auth.uid())
            and pet_caregivers.status = 'accepted'
            and pet_caregivers.can_manage_medications
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.medications
    join public.pets on pets.id = medications.pet_id
    where medications.id = medication_logs.medication_id
      and (
        pets.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.pet_caregivers
          where pet_caregivers.pet_id = pets.id
            and pet_caregivers.caregiver_id = (select auth.uid())
            and pet_caregivers.status = 'accepted'
            and pet_caregivers.can_manage_medications
        )
      )
  )
);

drop policy if exists "prescriptions_select_owner" on public.prescriptions;
create policy "prescriptions_select_owner"
on public.prescriptions for select
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "prescriptions_insert_owner" on public.prescriptions;
create policy "prescriptions_insert_owner"
on public.prescriptions for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.pets
    where pets.id = prescriptions.pet_id
      and pets.owner_id = (select auth.uid())
  )
  and (
    medication_id is null
    or exists (
      select 1
      from public.medications
      where medications.id = prescriptions.medication_id
        and medications.pet_id = prescriptions.pet_id
    )
  )
);

drop policy if exists "prescriptions_update_owner" on public.prescriptions;
create policy "prescriptions_update_owner"
on public.prescriptions for update
to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.pets
    where pets.id = prescriptions.pet_id
      and pets.owner_id = (select auth.uid())
  )
  and (
    medication_id is null
    or exists (
      select 1
      from public.medications
      where medications.id = prescriptions.medication_id
        and medications.pet_id = prescriptions.pet_id
    )
  )
);

drop policy if exists "prescriptions_delete_owner" on public.prescriptions;
create policy "prescriptions_delete_owner"
on public.prescriptions for delete
to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "medical_records_owner_manage" on public.medical_records;
drop policy if exists "medical_records_select_access" on public.medical_records;
create policy "medical_records_select_access"
on public.medical_records for select
to authenticated
using (
  exists (
    select 1
    from public.pets
    where pets.id = medical_records.pet_id
      and (
        pets.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.pet_caregivers
          where pet_caregivers.pet_id = pets.id
            and pet_caregivers.caregiver_id = (select auth.uid())
            and pet_caregivers.status = 'accepted'
            and pet_caregivers.can_view_records
        )
      )
  )
);

drop policy if exists "medical_records_manage_access" on public.medical_records;
create policy "medical_records_manage_access"
on public.medical_records for all
to authenticated
using (
  exists (
    select 1
    from public.pets
    where pets.id = medical_records.pet_id
      and (
        pets.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.pet_caregivers
          where pet_caregivers.pet_id = pets.id
            and pet_caregivers.caregiver_id = (select auth.uid())
            and pet_caregivers.status = 'accepted'
            and pet_caregivers.can_manage_records
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.pets
    where pets.id = medical_records.pet_id
      and (
        pets.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.pet_caregivers
          where pet_caregivers.pet_id = pets.id
            and pet_caregivers.caregiver_id = (select auth.uid())
            and pet_caregivers.status = 'accepted'
            and pet_caregivers.can_manage_records
        )
      )
  )
);

drop policy if exists "reminders_owner_manage" on public.reminders;
drop policy if exists "reminders_select_access" on public.reminders;
create policy "reminders_select_access"
on public.reminders for select
to authenticated
using (
  exists (
    select 1
    from public.pets
    where pets.id = reminders.pet_id
      and (
        pets.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.pet_caregivers
          where pet_caregivers.pet_id = pets.id
            and pet_caregivers.caregiver_id = (select auth.uid())
            and pet_caregivers.status = 'accepted'
            and pet_caregivers.can_view_pet
        )
      )
  )
);

drop policy if exists "reminders_manage_access" on public.reminders;
create policy "reminders_manage_access"
on public.reminders for all
to authenticated
using (
  exists (
    select 1
    from public.pets
    where pets.id = reminders.pet_id
      and (
        pets.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.pet_caregivers
          where pet_caregivers.pet_id = pets.id
            and pet_caregivers.caregiver_id = (select auth.uid())
            and pet_caregivers.status = 'accepted'
            and pet_caregivers.can_manage_reminders
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.pets
    where pets.id = reminders.pet_id
      and (
        pets.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.pet_caregivers
          where pet_caregivers.pet_id = pets.id
            and pet_caregivers.caregiver_id = (select auth.uid())
            and pet_caregivers.status = 'accepted'
            and pet_caregivers.can_manage_reminders
        )
      )
  )
);

drop policy if exists "pet_documents_owner_manage" on public.pet_documents;
drop policy if exists "pet_documents_select_access" on public.pet_documents;
create policy "pet_documents_select_access"
on public.pet_documents for select
to authenticated
using (
  exists (
    select 1
    from public.pets
    where pets.id = pet_documents.pet_id
      and (
        pets.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.pet_caregivers
          where pet_caregivers.pet_id = pets.id
            and pet_caregivers.caregiver_id = (select auth.uid())
            and pet_caregivers.status = 'accepted'
            and pet_caregivers.can_view_records
        )
      )
  )
);

drop policy if exists "pet_documents_manage_access" on public.pet_documents;
create policy "pet_documents_manage_access"
on public.pet_documents for all
to authenticated
using (
  exists (
    select 1
    from public.pets
    where pets.id = pet_documents.pet_id
      and (
        pets.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.pet_caregivers
          where pet_caregivers.pet_id = pets.id
            and pet_caregivers.caregiver_id = (select auth.uid())
            and pet_caregivers.status = 'accepted'
            and pet_caregivers.can_manage_records
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.pets
    where pets.id = pet_documents.pet_id
      and (
        pets.owner_id = (select auth.uid())
        or exists (
          select 1
          from public.pet_caregivers
          where pet_caregivers.pet_id = pets.id
            and pet_caregivers.caregiver_id = (select auth.uid())
            and pet_caregivers.status = 'accepted'
            and pet_caregivers.can_manage_records
        )
      )
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'pet-files',
  'pet-files',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pet_files_select_own" on storage.objects;
drop policy if exists "pet_files_select_access" on storage.objects;
create policy "pet_files_select_access"
on storage.objects for select
to authenticated
using (
  bucket_id = 'pet-files'
  and (
    owner_id = (select auth.uid()::text)
    or exists (
      select 1
      from public.pet_documents
      join public.pets on pets.id = pet_documents.pet_id
      where pet_documents.bucket_id = storage.objects.bucket_id
        and pet_documents.file_path = storage.objects.name
        and (
          pets.owner_id = (select auth.uid())
          or exists (
            select 1
            from public.pet_caregivers
            where pet_caregivers.pet_id = pets.id
              and pet_caregivers.caregiver_id = (select auth.uid())
              and pet_caregivers.status = 'accepted'
              and pet_caregivers.can_view_records
          )
        )
    )
    or exists (
      select 1
      from public.prescriptions
      where prescriptions.bucket_id = storage.objects.bucket_id
        and prescriptions.file_path = storage.objects.name
        and prescriptions.owner_id = (select auth.uid())
    )
  )
);

drop policy if exists "pet_files_insert_own_folder" on storage.objects;
create policy "pet_files_insert_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'pet-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "pet_files_update_own" on storage.objects;
drop policy if exists "pet_files_update_access" on storage.objects;
create policy "pet_files_update_access"
on storage.objects for update
to authenticated
using (
  bucket_id = 'pet-files'
  and (
    owner_id = (select auth.uid()::text)
    or exists (
      select 1
      from public.pet_documents
      join public.pets on pets.id = pet_documents.pet_id
      where pet_documents.bucket_id = storage.objects.bucket_id
        and pet_documents.file_path = storage.objects.name
        and (
          pets.owner_id = (select auth.uid())
          or exists (
            select 1
            from public.pet_caregivers
            where pet_caregivers.pet_id = pets.id
              and pet_caregivers.caregiver_id = (select auth.uid())
              and pet_caregivers.status = 'accepted'
              and pet_caregivers.can_manage_records
          )
        )
    )
    or exists (
      select 1
      from public.prescriptions
      where prescriptions.bucket_id = storage.objects.bucket_id
        and prescriptions.file_path = storage.objects.name
        and prescriptions.owner_id = (select auth.uid())
    )
  )
)
with check (
  bucket_id = 'pet-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "pet_files_delete_own" on storage.objects;
drop policy if exists "pet_files_delete_access" on storage.objects;
create policy "pet_files_delete_access"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'pet-files'
  and (
    owner_id = (select auth.uid()::text)
    or exists (
      select 1
      from public.pet_documents
      join public.pets on pets.id = pet_documents.pet_id
      where pet_documents.bucket_id = storage.objects.bucket_id
        and pet_documents.file_path = storage.objects.name
        and (
          pets.owner_id = (select auth.uid())
          or exists (
            select 1
            from public.pet_caregivers
            where pet_caregivers.pet_id = pets.id
              and pet_caregivers.caregiver_id = (select auth.uid())
              and pet_caregivers.status = 'accepted'
              and pet_caregivers.can_manage_records
          )
        )
    )
    or exists (
      select 1
      from public.prescriptions
      where prescriptions.bucket_id = storage.objects.bucket_id
        and prescriptions.file_path = storage.objects.name
        and prescriptions.owner_id = (select auth.uid())
    )
  )
);
