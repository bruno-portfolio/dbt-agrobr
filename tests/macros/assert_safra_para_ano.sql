select casos.*
from (
    values
    ('2023/24', 1, 2024),
    ('1999/00', 1, 2000),
    ('2023/24', 0, 2023)
) as casos (safra, deslocamento, esperado)
where {{ safra_para_ano('casos.safra', 'casos.deslocamento') }} != casos.esperado
