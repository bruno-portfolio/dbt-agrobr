select casos.*
from (
    values
    (2024, 1, '2023/24'),
    (2000, 1, '1999/00'),
    (2023, 0, '2023/24')
) as casos (ano, deslocamento, esperado)
where
    {{ ano_para_safra('casos.ano', 'casos.deslocamento') }} != casos.esperado
    or {{ safra_para_ano(ano_para_safra('casos.ano', 'casos.deslocamento'), 'casos.deslocamento') }}
    != casos.ano
