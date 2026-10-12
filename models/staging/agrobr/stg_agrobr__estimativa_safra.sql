with fonte as (
    select * from {{ source('agrobr', 'estimativa_safra') }}
)

select
    fonte,
    produto,
    safra,
    {{ safra_para_ano('safra') }} as ano_final_safra,
    uf,
    levantamento,
    data_publicacao,
    ano_lspa,
    mes_lspa,
    {{ converter_unidade('area_plantada', 'unidade_area', "'ha'") }} as area_plantada_ha,
    {{ converter_unidade('area_colhida', 'unidade_area', "'ha'") }} as area_colhida_ha,
    {{ converter_unidade('producao', 'unidade_producao', "'t'") }} as producao_t,
    produtividade as produtividade_kg_ha
from fonte
