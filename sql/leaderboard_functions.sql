-- Función para obtener ranking de cartas
create or replace function obtener_ranking_cartas(limite int)
returns table (
    username text,
    total_cartas int
) language sql security definer as $$
    select 
        p.username,
        coalesce(sum(i.cantidad), 0)::int as total_cartas
    from profiles p
    left join inventory i on i.user_id = p.id
    group by p.id, p.username
    order by total_cartas desc
    limit limite;
$$;

-- Función para obtener ranking de monedas
create or replace function obtener_ranking_monedas(limite int)
returns table (
    username text,
    monedas int
) language sql security definer as $$
    select username, monedas
    from profiles
    order by monedas desc
    limit limite;
$$;

-- Permisos para ejecutar las funciones de leaderboard
grant execute on function obtener_ranking_cartas(int) to authenticated;
grant execute on function obtener_ranking_monedas(int) to authenticated;