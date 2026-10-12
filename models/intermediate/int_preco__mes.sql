with diario as (
    select
        produto,
        praca,
        unidade,
        preco,
        preco_brl_t,
        metodologia,
        date_trunc('month', data) as mes
    from {{ ref('stg_agrobr__preco_diario') }}
    where preco is not null
)

select
    diario.produto,
    diario.praca,
    diario.unidade,
    diario.mes,
    avg(diario.preco) as preco_medio,
    avg(diario.preco_brl_t) as preco_medio_brl_t,
    {{ deflacionar('avg(diario.preco)', 'ipca.indice', 'ipca.indice_base') }} as preco_medio_real,
    {{ deflacionar('avg(diario.preco_brl_t)', 'ipca.indice', 'ipca.indice_base') }}
        as preco_medio_brl_t_real,
    count(*) as dias_com_preco,
    count(*) filter (where diario.metodologia <> 'indicador_esalq') as dias_via_republicacao,
    min(diario.preco) as preco_minimo,
    max(diario.preco) as preco_maximo
from diario
left join {{ ref('int_ipca__indice_mensal') }} as ipca
    on diario.mes = ipca.mes
group by diario.produto, diario.praca, diario.unidade, diario.mes, ipca.indice, ipca.indice_base
