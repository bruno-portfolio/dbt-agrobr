with fonte as (
    select * from {{ source('agrobr', 'bcb_sgs') }}
)

select
    codigo,
    nome_serie,
    data,
    data_fim,
    valor
from fonte
