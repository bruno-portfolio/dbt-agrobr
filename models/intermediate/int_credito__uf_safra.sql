select
    uf,
    safra,
    produto,
    finalidade,
    cast(sum(qtd_contratos) as bigint) as qtd_contratos,
    sum(valor_brl) as valor_brl,
    sum(area_financiada_ha) as area_financiada_ha
from {{ ref('stg_agrobr__credito_rural') }}
where agregacao = 'uf' and uf is not null
group by uf, safra, produto, finalidade
