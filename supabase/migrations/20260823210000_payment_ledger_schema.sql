begin;

do $$ begin create type public.payment_transaction_type as enum ('inspection_fee', 'final_service'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_transaction_status as enum ('initiated', 'verified', 'failed', 'refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type public.refund_status as enum ('not_requested', 'pending', 'refunded', 'failed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.final_settlement_status as enum ('not_started', 'pending', 'settled', 'cancelled'); exception when duplicate_object then null; end $$;

create table public.booking_financials (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  inspection_fee_amount integer not null check (inspection_fee_amount > 0),
  final_service_amount integer check (final_service_amount is null or final_service_amount >= 0),
  amount_paid integer not null default 0 check (amount_paid >= 0),
  amount_credited_toward_final integer not null default 0 check (amount_credited_toward_final >= 0),
  amount_due integer check (amount_due is null or amount_due >= 0),
  amount_refunded integer not null default 0 check (amount_refunded >= 0),
  refund_status public.refund_status not null default 'not_requested',
  final_settlement_status public.final_settlement_status not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (amount_credited_toward_final <= inspection_fee_amount),
  check (amount_refunded <= amount_paid)
);

create table public.booking_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  transaction_type public.payment_transaction_type not null,
  status public.payment_transaction_status not null default 'initiated',
  amount integer not null check (amount > 0),
  currency text not null default 'EGP' check (currency = 'EGP'),
  provider_name text not null check (char_length(trim(provider_name)) between 2 and 80),
  provider_reference text not null check (char_length(trim(provider_reference)) between 3 and 180),
  verified_at timestamptz,
  verified_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_name, provider_reference),
  check ((status = 'verified' and verified_at is not null) or status <> 'verified')
);

create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null check (char_length(trim(provider_name)) between 2 and 80),
  provider_event_id text not null check (char_length(trim(provider_event_id)) between 3 and 180),
  provider_reference text not null check (char_length(trim(provider_reference)) between 3 and 180),
  booking_id uuid references public.bookings(id) on delete set null,
  status text not null check (status in ('received', 'processed', 'rejected')),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider_name, provider_event_id)
);

alter table public.booking_financials enable row level security;
alter table public.booking_payment_transactions enable row level security;
alter table public.payment_webhook_events enable row level security;
revoke all on table public.booking_financials, public.booking_payment_transactions, public.payment_webhook_events from public, anon, authenticated;

insert into public.booking_financials (booking_id, inspection_fee_amount, amount_paid, amount_credited_toward_final, final_settlement_status)
select b.id, b.fee_amount, case when b.payment_status = 'paid' then b.fee_amount else 0 end,
       case when b.fee_credit_status = 'credited' then b.fee_amount else 0 end,
       case when b.student_viewing_decision = 'accepted' then 'pending'::public.final_settlement_status else 'not_started'::public.final_settlement_status end
from public.bookings b where b.fee_amount is not null;

commit;
