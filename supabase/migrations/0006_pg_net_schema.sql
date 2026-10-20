-- Move pg_net out of the public schema (security advisor: extension_in_public).
-- Its functions stay in the net schema, so the cron job in 0005 keeps working.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
