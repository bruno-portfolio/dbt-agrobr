{% macro safra_para_ano(safra, deslocamento=1) -%}
    (cast(left({{ safra }}, 4) as integer) + {{ deslocamento }})
{%- endmacro %}
