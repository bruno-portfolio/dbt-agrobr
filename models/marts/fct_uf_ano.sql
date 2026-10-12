select
    pam.uf,
    pam.ano,
    pam.produto,
    pam.area_plantada_ha,
    pam.area_colhida_ha,
    pam.producao_t,
    pam.rendimento_kg_ha,
    pam.valor_producao_brl,
    {{ deflacionar('pam.valor_producao_brl', 'ipca.indice_medio', 'ipca.indice_base') }}
        as valor_producao_brl_real,
    ipca.mes_base as mes_base_real,
    pam.producao_t / nullif(brasil.producao_t, 0) as participacao_producao_brasil,
    rank() over (
        partition by pam.ano, pam.produto order by pam.producao_t desc nulls last
    ) as posicao_producao,
    pam.municipios,
    pam.producao_t_soma_municipal,
    {{ licenca_da_source('producao_anual') }} as licencas
from {{ ref('int_pam__uf_ano') }} as pam
left join {{ ref('int_pam__brasil_ano') }} as brasil
    on pam.ano = brasil.ano and pam.produto = brasil.produto
left join {{ ref('int_ipca__indice_anual') }} as ipca
    on pam.ano = ipca.ano
