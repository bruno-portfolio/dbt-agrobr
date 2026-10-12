with levantamento as (
    select * from {{ ref('stg_agrobr__estimativa_levantamento') }}
    where fonte = 'conab' and uf is not null
)

select
    produto,
    safra,
    uf,
    levantamento,
    data_publicacao,
    area_plantada_ha,
    producao_t,
    produtividade_kg_ha,
    producao_t / nullif(lag(producao_t) over (
        partition by produto, safra, uf order by levantamento
    ), 0) - 1 as producao_variacao_pct,
    {{ licenca_da_source('estimativa_levantamento') }} as licencas
from levantamento
