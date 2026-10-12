with fonte as (
    select * from {{ source('agrobr_pontos', 'clima_celula') }}
)

select
    celula_lat,
    celula_lon,
    cast(mes as date) as mes,
    {{ ano_para_safra('year(mes) + cast(month(mes) >= 7 as integer)') }} as safra,
    precip_acum_mm,
    temp_media as temp_media_c,
    temp_max_media as temp_max_media_c,
    temp_min_media as temp_min_media_c,
    umidade_media as umidade_media_pct,
    radiacao_media_mj as radiacao_media_mj_m2_dia,
    vento_medio_ms,
    dias as dias_com_dado
from fonte
