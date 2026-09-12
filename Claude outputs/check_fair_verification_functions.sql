select pg_get_functiondef(oid)
from pg_proc
where proname in ('submit_fair_verification_request', 'has_my_pending_fair_verification', 'get_my_pending_fair_verifications')
order by proname;
