select
    safra,
    produto,
    sum(conab_producao_t) as conab_producao_t,
    sum(pam_producao_t) as pam_producao_t
from {{ ref('fct_uf_safra') }}
where conab_origem = 'serie_historica'
group by safra, produto
having
    count(pam_producao_t) <> count(*)
    or abs(sum(conab_producao_t) / nullif(sum(pam_producao_t), 0) - 1)
    > {{ var('tolerancia_pam_conab') }}
