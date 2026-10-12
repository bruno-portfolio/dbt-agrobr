with produtos as (
    select
        produto,
        deslocamento_ano,
        janela_jul_jun
    from {{ ref('produtos') }}
    where calendario = 'safra' and codigo_pam is not null
),

pam as (
    select
        pam.*,
        {{ ano_para_safra('pam.ano', 'produtos.deslocamento_ano') }} as safra,
        {{ deflacionar('pam.valor_producao_brl', 'ipca.indice_medio', 'ipca.indice_base') }}
            as valor_producao_brl_real
    from {{ ref('int_pam__uf_ano') }} as pam
    inner join produtos
        on pam.produto = produtos.produto
    left join {{ ref('int_ipca__indice_anual') }} as ipca
        on pam.ano = ipca.ano
),

conab as (
    select estimativa.*
    from {{ ref('int_estimativa__ultimo_levantamento') }} as estimativa
    inner join produtos
        on estimativa.produto = produtos.produto
    where estimativa.fonte = 'conab' and estimativa.uf is not null
),

custeio as (
    select
        credito.*,
        {{ deflacionar('credito.valor_brl', 'ipca.indice_medio', 'ipca.indice_base') }}
            as valor_brl_real
    from {{ ref('int_credito__uf_safra') }} as credito
    inner join produtos
        on credito.produto = produtos.produto
    left join {{ ref('int_ipca__indice_safra') }} as ipca
        on credito.safra = ipca.safra
    where credito.finalidade = 'custeio'
),

base_ipca as (
    select distinct mes_base
    from {{ ref('int_ipca__indice_mensal') }}
),

chaves as (
    select
        uf,
        safra,
        produto
    from pam
    union
    select
        uf,
        safra,
        produto
    from conab
    union
    select
        uf,
        safra,
        produto
    from custeio
),

linhas as (
    select
        chaves.uf,
        chaves.safra,
        chaves.produto,
        {{ safra_para_ano('chaves.safra', 'produtos.deslocamento_ano') }} as ano_pam,
        base_ipca.mes_base as mes_base_real,
        pam.area_plantada_ha as pam_area_plantada_ha,
        pam.area_colhida_ha as pam_area_colhida_ha,
        pam.producao_t as pam_producao_t,
        pam.rendimento_kg_ha as pam_rendimento_kg_ha,
        pam.valor_producao_brl as pam_valor_producao_brl,
        pam.valor_producao_brl_real as pam_valor_producao_brl_real,
        conab.origem_estimativa as conab_origem,
        conab.levantamento as conab_levantamento,
        conab.data_publicacao as conab_data_publicacao,
        conab.area_plantada_ha as conab_area_plantada_ha,
        conab.producao_t as conab_producao_t,
        conab.produtividade_kg_ha as conab_produtividade_kg_ha,
        (conab.producao_t - pam.producao_t)
        / nullif(pam.producao_t, 0) as conab_menos_pam_producao_pct,
        custeio.valor_brl as credito_custeio_brl,
        custeio.valor_brl_real as credito_custeio_brl_real,
        custeio.qtd_contratos as credito_custeio_contratos,
        case when produtos.janela_jul_jun then clima.precip_jul_jun_mm end
            as clima_precip_jul_jun_mm,
        case when produtos.janela_jul_jun then clima.temp_media_jul_jun_c end
            as clima_temp_media_jul_jun_c,
        case
            when produtos.janela_jul_jun
                then clima.area_plantada_ha_com_clima / nullif(clima.area_plantada_ha, 0)
        end as clima_area_coberta_pct
    from chaves
    inner join produtos
        on chaves.produto = produtos.produto
    cross join base_ipca
    left join pam
        on chaves.uf = pam.uf and chaves.safra = pam.safra and chaves.produto = pam.produto
    left join conab
        on chaves.uf = conab.uf and chaves.safra = conab.safra and chaves.produto = conab.produto
    left join custeio
        on
            chaves.uf = custeio.uf
            and chaves.safra = custeio.safra
            and chaves.produto = custeio.produto
    left join {{ ref('int_clima__uf_produto_safra') }} as clima
        on chaves.uf = clima.uf and chaves.safra = clima.safra and chaves.produto = clima.produto
)

select
    *,
    {{ licenca_mais_restritiva([
        "case when pam_producao_t is not null then " ~ licenca_da_source('producao_anual') ~ " end",
        "case when conab_producao_t is not null then " ~ licenca_da_source('estimativa_safra') ~ " end",
        "case when credito_custeio_brl is not null then " ~ licenca_da_source('credito_rural') ~ " end",
        "case when pam_valor_producao_brl_real is not null or credito_custeio_brl_real is not null then "
            ~ licenca_da_source('bcb_sgs') ~ " end",
        "case when clima_precip_jul_jun_mm is not null then "
            ~ licenca_da_source('clima_celula', 'agrobr_pontos') ~ " end",
    ]) }} as licencas
from linhas
