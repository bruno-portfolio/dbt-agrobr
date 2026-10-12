with estimativa as (
    select
        *,
        case
            when fonte = 'conab' and levantamento is null then 'serie_historica'
            when fonte = 'conab' then 'levantamento'
            else 'lspa'
        end as origem_estimativa
    from {{ ref('stg_agrobr__estimativa_safra') }}
)

select
    fonte,
    produto,
    safra,
    ano_final_safra,
    uf,
    origem_estimativa,
    levantamento,
    data_publicacao,
    ano_lspa,
    mes_lspa,
    area_plantada_ha,
    area_colhida_ha,
    producao_t,
    produtividade_kg_ha
from estimativa
qualify row_number() over (
    partition by fonte, produto, safra, uf
    order by
        origem_estimativa = 'serie_historica' desc,
        data_publicacao desc nulls last,
        levantamento desc nulls last,
        ano_lspa desc nulls last,
        mes_lspa desc nulls last
) = 1
