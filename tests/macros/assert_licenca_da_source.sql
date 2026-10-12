select
    {{ licenca_da_source('preco_diario') }} as preco_diario,
    {{ licenca_da_source('producao_anual') }} as producao_anual,
    {{ licenca_da_source('clima_celula', 'agrobr_pontos') }} as clima_celula
where
    {{ licenca_da_source('preco_diario') }} is distinct from 'nc'
    or {{ licenca_da_source('producao_anual') }} is distinct from 'livre'
    or {{ licenca_da_source('clima_celula', 'agrobr_pontos') }} is distinct from 'livre'
