with ipca as (
    select
        data as mes,
        valor as variacao_pct
    from {{ ref('stg_agrobr__series_economicas') }}
    where codigo = {{ var('codigo_ipca') }}
),

encadeado as (
    select
        mes,
        variacao_pct,
        100 * exp(sum(ln(1 + variacao_pct / 100)) over (order by mes)) as indice
    from ipca
),

base as (
    select
        mes as mes_base,
        indice as indice_base
    from encadeado
    {% if var('mes_base_ipca') %}
        where mes = cast('{{ var("mes_base_ipca") }}' as date)
    {% else %}
        qualify mes = max(mes) over ()
    {% endif %}
)

select
    encadeado.mes,
    encadeado.variacao_pct,
    encadeado.indice,
    base.mes_base,
    base.indice_base
from encadeado
cross join base
