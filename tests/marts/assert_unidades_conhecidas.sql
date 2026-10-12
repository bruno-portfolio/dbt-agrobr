with conhecidas as (
    select unidades.de as unidade
    from {{ ref('unidades') }} as unidades
),

usadas as (
    select
        'producao_anual' as tabela,
        unidade_producao as unidade
    from {{ ref('stg_agrobr__producao_anual') }}
    union
    select
        'producao_anual' as tabela,
        unidade_rendimento as unidade
    from {{ ref('stg_agrobr__producao_anual') }}
    union
    select
        'producao_anual' as tabela,
        unidade_valor_producao as unidade
    from {{ ref('stg_agrobr__producao_anual') }}
    union
    select
        'preco_diario' as tabela,
        unidade
    from {{ ref('stg_agrobr__preco_diario') }}
    union
    select
        'estimativa_safra' as tabela,
        unidade_area as unidade
    from {{ source('agrobr', 'estimativa_safra') }}
    union
    select
        'estimativa_safra' as tabela,
        unidade_producao as unidade
    from {{ source('agrobr', 'estimativa_safra') }}
    union
    select
        'estimativa_levantamento' as tabela,
        unidade_area as unidade
    from {{ source('agrobr', 'estimativa_levantamento') }}
    union
    select
        'estimativa_levantamento' as tabela,
        unidade_producao as unidade
    from {{ source('agrobr', 'estimativa_levantamento') }}
)

select
    usadas.tabela,
    usadas.unidade
from usadas
left join conhecidas
    on usadas.unidade = conhecidas.unidade
where usadas.unidade is not null and conhecidas.unidade is null
