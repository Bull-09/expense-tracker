alter table public.categories add column if not exists monthly_budget numeric(12,2)
  check (monthly_budget is null or monthly_budget >= 0);
