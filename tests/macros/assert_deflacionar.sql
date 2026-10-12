select casos.*
from (
    values
    (100.0, 110.0, 121.0, 110.0),
    (100.0, 0.0, 121.0, null)
) as casos (valor, indice, indice_base, esperado)
where
    {{ deflacionar('casos.valor', 'casos.indice', 'casos.indice_base') }}
    is distinct from casos.esperado
