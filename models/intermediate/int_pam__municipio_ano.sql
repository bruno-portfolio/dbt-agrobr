select
    pam.cod_municipio,
    pam.uf,
    pam.ano,
    pam.produto,
    pam.area_plantada_ha,
    pam.area_colhida_ha,
    pam.producao_t,
    pam.rendimento_kg_ha,
    pam.valor_producao_brl
from {{ ref('stg_agrobr__producao_anual') }} as pam
where pam.cod_municipio is not null
