-- Eliminamos TODAS las versiones cacheadas de abrir_sobre antes de volver a crearla
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE p.proname = 'abrir_sobre'
             AND n.nspname = 'public'
  LOOP
    EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
  END LOOP;
END $$;
