select
    municipio.cod_municipio,
    municipio.uf
from {{ ref('municipios_ibge') }} as municipio
where
    {{ uf_de_codigo_ibge('municipio.cod_municipio') }} is distinct from municipio.uf
    or {{ uf_de_codigo_ibge('municipio.cod_municipio // 100000') }} is distinct from municipio.uf
    or {{ uf_de_codigo_ibge('1') }} is not null
