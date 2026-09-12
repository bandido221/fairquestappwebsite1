select pg_get_functiondef(oid)
from pg_proc
where proname in ('approve_new_fair', 'approve_fair_verification', 'approve_fair');
