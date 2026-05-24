-- Supabase schema for Pagaska member authentication
-- Run this in Supabase SQL editor or via CLI.

create table if not exists members (
  id uuid default gen_random_uuid() primary key,
  fullname text not null,
  jabatan text not null,
  generasi text not null,
  role text not null default 'member',
  created_at timestamptz not null default now()
);

create index if not exists idx_members_fullname on members (lower(fullname));
create index if not exists idx_members_jabatan on members (lower(jabatan));
create index if not exists idx_members_generasi on members (lower(generasi));
