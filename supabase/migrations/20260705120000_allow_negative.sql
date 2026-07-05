-- Spor — allow counters ("teller") to hold negative values (net-score habits,
-- e.g. "si nei til fristelser": +1 for a "no", −1 for a "yes").

alter table public.habits
  add column allow_negative boolean not null default false;
