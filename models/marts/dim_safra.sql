with safras as (
    select safra from {{ ref('int_estimativa__ultimo_levantamento') }}
    union
    select safra from {{ ref('int_credito__uf_safra') }}
    union
    select safra from {{ ref('int_clima__celula_safra') }}
)

select
    safra,
    {{ safra_para_ano('safra', 0) }} as ano_inicial,
    {{ safra_para_ano('safra') }} as ano_final,
    make_date({{ safra_para_ano('safra', 0) }}, 7, 1) as data_inicio,
    make_date({{ safra_para_ano('safra') }}, 6, 30) as data_fim
from safras
