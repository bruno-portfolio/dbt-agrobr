select
    'municipio' as nivel,
    cast(cod_municipio as varchar) as localidade,
    ano,
    produto,
    area_plantada_ha,
    area_colhida_ha
from {{ ref('fct_municipio_ano') }}
where area_colhida_ha > area_plantada_ha

union all

select
    'uf' as nivel,
    uf as localidade,
    ano,
    produto,
    area_plantada_ha,
    area_colhida_ha
from {{ ref('fct_uf_ano') }}
where area_colhida_ha > area_plantada_ha
