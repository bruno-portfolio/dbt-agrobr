with publicada as (
    select
        ano,
        produto,
        area_plantada_ha,
        area_colhida_ha,
        producao_t,
        rendimento_kg_ha,
        valor_producao_brl
    from {{ ref('stg_agrobr__producao_anual') }}
    where localidade_cod = 1
),

soma_uf as (
    select
        ano,
        produto,
        count(*) as ufs,
        sum(producao_t) as producao_t,
        sum(area_plantada_ha) as area_plantada_ha,
        sum(valor_producao_brl) as valor_producao_brl
    from {{ ref('int_pam__uf_ano') }}
    group by ano, produto
),

chaves as (
    select
        ano,
        produto
    from publicada
    union
    select
        ano,
        produto
    from soma_uf
)

select
    chaves.ano,
    chaves.produto,
    publicada.area_plantada_ha,
    publicada.area_colhida_ha,
    publicada.producao_t,
    publicada.rendimento_kg_ha,
    publicada.valor_producao_brl,
    soma_uf.ufs,
    soma_uf.area_plantada_ha as area_plantada_ha_soma_uf,
    soma_uf.producao_t as producao_t_soma_uf,
    soma_uf.valor_producao_brl as valor_producao_brl_soma_uf
from chaves
left join publicada
    on chaves.ano = publicada.ano and chaves.produto = publicada.produto
left join soma_uf
    on chaves.ano = soma_uf.ano and chaves.produto = soma_uf.produto
