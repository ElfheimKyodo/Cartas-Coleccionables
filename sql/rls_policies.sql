-- Políticas para leaderboard (deben crearse después de las políticas restrictivas)
-- Permiten leer datos agregados de todos los usuarios para ranking

-- Política para que usuarios autenticados lean el username de todos los perfiles
DROP POLICY IF EXISTS "leaderboard read profiles" ON profiles;
DROP POLICY IF EXISTS "leaderboard read inventory" ON inventory;

CREATE POLICY "leaderboard read profiles"
ON profiles for select
to authenticated
using (true);

CREATE POLICY "leaderboard read inventory"
ON inventory for select
to authenticated
using (true);