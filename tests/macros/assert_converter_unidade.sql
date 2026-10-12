select casos.*
from (
    values
    (1.0, 'mil_ha', 'ha', 1000.0),
    (2.5, 'mil_ton', 't', 2500.0),
    (60.0, 'BRL/sc60kg', 'BRL/t', 1000.0),
    (100.0, 'cBRL/lb', 'BRL/t', 2204.6226218487757),
    (1.0, 'mil_frutos', 't', null)
) as casos (valor, de, para, esperado)
where
    abs(
        coalesce({{ converter_unidade('casos.valor', 'casos.de', 'casos.para') }}, -1)
        - coalesce(casos.esperado, -1)
    )
    > 1e-9
