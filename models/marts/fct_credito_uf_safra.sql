select
    credito.uf,
    credito.safra,
    credito.produto,
    credito.finalidade,
    credito.valor_brl,
    {{ deflacionar('credito.valor_brl', 'ipca.indice_medio', 'ipca.indice_base') }}
        as valor_brl_real,
    ipca.mes_base as mes_base_real,
    credito.qtd_contratos,
    credito.valor_brl / nullif(credito.qtd_contratos, 0) as valor_medio_contrato_brl,
    credito.valor_brl / nullif(sum(credito.valor_brl) over (
        partition by credito.safra, credito.produto, credito.finalidade
    ), 0) as participacao_valor_brasil,
    {{ licenca_mais_restritiva([
        licenca_da_source('credito_rural'),
        "case when ipca.indice_medio is not null then " ~ licenca_da_source('bcb_sgs') ~ " end",
    ]) }} as licencas
from {{ ref('int_credito__uf_safra') }} as credito
left join {{ ref('int_ipca__indice_safra') }} as ipca
    on credito.safra = ipca.safra
