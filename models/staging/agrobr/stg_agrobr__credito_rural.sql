with fonte as (
    select * from {{ source('agrobr', 'credito_rural') }}
)

select
    safra,
    {{ safra_para_ano('safra') }} as ano_final_safra,
    produto,
    uf,
    finalidade,
    agregacao,
    programa,
    cd_programa,
    qtd_contratos,
    valor as valor_brl,
    area_financiada as area_financiada_ha,
    fonte
from fonte
