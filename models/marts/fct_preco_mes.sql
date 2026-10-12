select
    preco.produto,
    preco.praca,
    indicador.indicador,
    indicador.referencia,
    preco.unidade,
    preco.mes,
    preco.preco_medio,
    preco.preco_medio_brl_t,
    preco.preco_medio_real,
    preco.preco_medio_brl_t_real,
    ipca.mes_base as mes_base_real,
    preco.preco_minimo,
    preco.preco_maximo,
    preco.dias_com_preco,
    preco.dias_via_republicacao,
    {{ licenca_mais_restritiva([
        licenca_da_source('preco_diario'),
        "case when preco.preco_medio_real is not null then " ~ licenca_da_source('bcb_sgs') ~ " end",
    ]) }} as licencas
from {{ ref('int_preco__mes') }} as preco
left join {{ ref('indicadores_cepea') }} as indicador
    on preco.produto = indicador.produto and preco.praca = indicador.praca
left join {{ ref('int_ipca__indice_mensal') }} as ipca
    on preco.mes = ipca.mes
