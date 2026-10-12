{% macro uf_de_codigo_ibge(codigo) -%}
    (
        select _uf_seed.uf
        from {{ ref('uf') }} as _uf_seed
        where
            _uf_seed.codigo_uf
            = case when {{ codigo }} < 100 then {{ codigo }} else {{ codigo }} // 100000 end
    )
{%- endmacro %}
