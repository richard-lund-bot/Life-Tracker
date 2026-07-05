-- Spor — add the cumulative "poeng" (Poengmål) measurement type.
-- A lifetime running score toward a big target (e.g. 1000); daily deltas are
-- stored as ordinary log rows and summed across all days by the client.

alter table public.habits
  drop constraint habits_kind_check;

alter table public.habits
  add constraint habits_kind_check
  check (kind in ('sjekk','teller','minutter','mengde','tidspunkt','unngaa','poeng'));
