select
    ano,
    produto,
    producao_t,
    producao_t_soma_uf,
    ufs
from {{ ref('int_pam__brasil_ano') }}
where
    ufs is distinct from 27
    or abs(coalesce(producao_t_soma_uf, 0) - coalesce(producao_t, 0))
    > {{ var('tolerancia_pam_soma_municipal') }} * greatest(coalesce(producao_t, 0), 1)
