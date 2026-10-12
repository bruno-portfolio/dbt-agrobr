select
    year(mes) as ano,
    avg(indice) as indice_medio,
    count(*) as meses,
    any_value(indice_base) as indice_base,
    any_value(mes_base) as mes_base
from {{ ref('int_ipca__indice_mensal') }}
group by year(mes)
having count(*) = 12
