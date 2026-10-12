with cobertura as (
    select distinct
        produto,
        'pam' as fonte
    from {{ ref('int_pam__brasil_ano') }}
    union
    select distinct
        produto,
        'conab' as fonte
    from {{ ref('int_estimativa__ultimo_levantamento') }}
    union
    select distinct
        produto,
        'cepea' as fonte
    from {{ ref('int_preco__mes') }}
    union
    select distinct
        produto,
        'sicor' as fonte
    from {{ ref('int_credito__uf_safra') }}
)

select
    produtos.produto,
    produtos.nome,
    produtos.nome_pam,
    produtos.codigo_pam,
    produtos.grupo_conab,
    produtos.deslocamento_ano,
    produtos.calendario,
    produtos.janela_jul_jun,
    bool_or(cobertura.fonte = 'pam') is true as tem_pam,
    bool_or(cobertura.fonte = 'conab') is true as tem_conab,
    bool_or(cobertura.fonte = 'cepea') is true as tem_preco,
    bool_or(cobertura.fonte = 'sicor') is true as tem_credito
from {{ ref('produtos') }} as produtos
left join cobertura
    on produtos.produto = cobertura.produto
group by all
