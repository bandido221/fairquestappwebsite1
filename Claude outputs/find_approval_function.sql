select proname
from pg_proc
where prosrc ilike '%fair_verification%'
   or proname ilike '%approve%fair%'
   or proname ilike '%fair%approv%';
