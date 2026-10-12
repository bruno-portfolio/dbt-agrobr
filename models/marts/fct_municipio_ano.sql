select
    pam.cod_municipio,
    municipio.nome as municipio,
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
    pam.producao_t / nullif(uf.producao_t, 0) as participacao_producao_uf,
    pam.producao_t / nullif(brasil.producao_t, 0) as participacao_producao_brasil,
    {{ licenca_da_source('producao_anual') }} as licencas
from {{ ref('int_pam__municipio_ano') }} as pam
inner join {{ ref('dim_municipio') }} as municipio
    on pam.cod_municipio = municipio.cod_municipio
left join {{ ref('int_pam__uf_ano') }} as uf
    on pam.uf = uf.uf and pam.ano = uf.ano and pam.produto = uf.produto
left join {{ ref('int_pam__brasil_ano') }} as brasil
    on pam.ano = brasil.ano and pam.produto = brasil.produto
left join {{ ref('int_ipca__indice_anual') }} as ipca
    on pam.ano = ipca.ano
