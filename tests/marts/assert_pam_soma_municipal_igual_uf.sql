select
    uf,
    ano,
    produto,
    producao_t,
    producao_t_soma_municipal
from {{ ref('int_pam__uf_ano') }}
where
    producao_t is distinct from producao_t_soma_municipal
    and abs(coalesce(producao_t_soma_municipal, 0) - coalesce(producao_t, 0))
    > {{ var('tolerancia_pam_soma_municipal') }} * greatest(coalesce(producao_t, 0), 1)
