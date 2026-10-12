{% macro converter_unidade(valor, de, para) -%}
    (
        {{ valor }} * (
            select _unidades_seed.fator
            from {{ ref('unidades') }} as _unidades_seed
            where _unidades_seed.de = {{ de }} and _unidades_seed.para = {{ para }}
        )
    )
{%- endmacro %}
