select
    {{ ano_para_safra('year(mes) + cast(month(mes) >= 7 as integer)') }} as safra,
    avg(indice) as indice_medio,
    count(*) as meses,
    any_value(indice_base) as indice_base,
    any_value(mes_base) as mes_base
from {{ ref('int_ipca__indice_mensal') }}
group by 1
having count(*) = 12
