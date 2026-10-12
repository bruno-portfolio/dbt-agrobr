with fonte as (
    select * from {{ source('agrobr', 'producao_anual') }}
)

select
    ano,
    produto,
    localidade,
    localidade_cod,
    coalesce(
        cod_municipio,
        case when localidade_cod between 1000000 and 9999999 then localidade_cod end
    ) as cod_municipio,
    {{ uf_de_codigo_ibge('localidade_cod') }} as uf,
    area_plantada as area_plantada_ha,
    area_colhida as area_colhida_ha,
    producao,
    unidade_producao,
    {{ converter_unidade('producao', 'unidade_producao', "'t'") }} as producao_t,
    rendimento,
    unidade_rendimento,
    {{ converter_unidade('rendimento', 'unidade_rendimento', "'kg/ha'") }} as rendimento_kg_ha,
    valor_producao,
    unidade_valor_producao,
    {{ converter_unidade('valor_producao', 'unidade_valor_producao', "'BRL'") }}
        as valor_producao_brl,
    condicao_produto,
    fonte
from fonte
