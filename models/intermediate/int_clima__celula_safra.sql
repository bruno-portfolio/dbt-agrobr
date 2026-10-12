with mensal as (
    select
        *,
        dias_com_dado = day(last_day(mes)) as mes_completo
    from {{ ref('stg_agrobr__clima_celula') }}
)

select
    celula_lat,
    celula_lon,
    safra,
    count(*) filter (where mes_completo) as meses_completos,
    case
        when count(*) filter (where mes_completo and precip_acum_mm is not null) = 12
            then sum(precip_acum_mm)
    end as precip_jul_jun_mm,
    case
        when count(*) filter (where mes_completo and temp_media_c is not null) = 12
            then avg(temp_media_c)
    end as temp_media_jul_jun_c
from mensal
group by celula_lat, celula_lon, safra
