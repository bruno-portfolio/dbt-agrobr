with publicada as (
    select
        uf,
        ano,
        produto,
        area_plantada_ha,
        area_colhida_ha,
        producao_t,
        rendimento_kg_ha,
        valor_producao_brl
    from {{ ref('stg_agrobr__producao_anual') }}
    where cod_municipio is null and localidade_cod between 11 and 53
),

soma_municipal as (
    select
        uf,
        ano,
        produto,
        count(*) as municipios,
        sum(area_plantada_ha) as area_plantada_ha,
        sum(area_colhida_ha) as area_colhida_ha,
        sum(producao_t) as producao_t,
        sum(valor_producao_brl) as valor_producao_brl
    from {{ ref('int_pam__municipio_ano') }}
    group by uf, ano, produto
),

chaves as (
    select
        uf,
        ano,
        produto
    from publicada
    union
    select
        uf,
        ano,
        produto
    from soma_municipal
)

select
    chaves.uf,
    chaves.ano,
    chaves.produto,
    publicada.area_plantada_ha,
    publicada.area_colhida_ha,
    publicada.producao_t,
    publicada.rendimento_kg_ha,
    publicada.valor_producao_brl,
    soma_municipal.municipios,
    soma_municipal.area_plantada_ha as area_plantada_ha_soma_municipal,
    soma_municipal.producao_t as producao_t_soma_municipal,
    soma_municipal.valor_producao_brl as valor_producao_brl_soma_municipal
from chaves
left join publicada
    on
        chaves.uf = publicada.uf
        and chaves.ano = publicada.ano
        and chaves.produto = publicada.produto
left join soma_municipal
    on
        chaves.uf = soma_municipal.uf
        and chaves.ano = soma_municipal.ano
        and chaves.produto = soma_municipal.produto
