select
    municipio.cod_municipio,
    municipio.nome,
    municipio.uf,
    uf.codigo_uf,
    uf.nome as nome_uf,
    uf.regiao,
    municipio.lat,
    municipio.lon,
    round(municipio.lat / {{ var('grade_lat_graus') }})
    * {{ var('grade_lat_graus') }} as celula_lat,
    round(municipio.lon / {{ var('grade_lon_graus') }}) * {{ var('grade_lon_graus') }} as celula_lon
from {{ ref('municipios_ibge') }} as municipio
inner join {{ ref('uf') }} as uf
    on municipio.uf = uf.uf
