select casos.*
from (
    values
    ('livre', null, 'nc', 'nc'),
    ('livre', 'zona_cinza', null, 'zona_cinza'),
    ('livre', null, null, 'livre'),
    ('restrito', 'nc', 'livre', 'restrito')
) as casos (a, b, c, esperada)
where
    {{ licenca_mais_restritiva(['casos.a', 'casos.b', 'casos.c']) }}
    is distinct from casos.esperada
