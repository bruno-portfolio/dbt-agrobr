with area as (
    select
        pam.uf,
        pam.produto,
        {{ ano_para_safra('pam.ano', 'calendario.deslocamento_ano') }} as safra,
        municipio.celula_lat,
        municipio.celula_lon,
        pam.area_plantada_ha
    from {{ ref('int_pam__municipio_ano') }} as pam
    inner join {{ ref('produtos') }} as calendario
        on pam.produto = calendario.produto
    inner join {{ ref('dim_municipio') }} as municipio
        on pam.cod_municipio = municipio.cod_municipio
    where calendario.janela_jul_jun and pam.area_plantada_ha > 0
)

select
    area.uf,
    area.produto,
    area.safra,
    sum(area.area_plantada_ha) as area_plantada_ha,
    sum(area.area_plantada_ha) filter (where clima.precip_jul_jun_mm is not null)
        as area_plantada_ha_com_clima,
    case
        when count(*) = count(clima.precip_jul_jun_mm)
            then sum(area.area_plantada_ha * clima.precip_jul_jun_mm) / sum(area.area_plantada_ha)
    end as precip_jul_jun_mm,
    case
        when count(*) = count(clima.temp_media_jul_jun_c)
            then
                sum(area.area_plantada_ha * clima.temp_media_jul_jun_c) / sum(area.area_plantada_ha)
    end as temp_media_jul_jun_c
from area
left join {{ ref('int_clima__celula_safra') }} as clima
    on
        area.celula_lat = clima.celula_lat
        and area.celula_lon = clima.celula_lon
        and area.safra = clima.safra
group by area.uf, area.produto, area.safra
