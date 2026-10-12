with fonte as (
    select * from {{ source('agrobr', 'preco_diario') }}
)

select
    data,
    {{ ano_para_safra('year(data) + cast(month(data) >= 7 as integer)') }} as safra,
    produto,
    praca,
    valor as preco,
    unidade,
    {{ converter_unidade('valor', 'unidade', "'BRL/t'") }} as preco_brl_t,
    valor_usd as preco_usd,
    peso_medio_kg,
    metodologia,
    fonte
from fonte
