{% macro ano_para_safra(ano, deslocamento=1) -%}
    (
        cast({{ ano }} - {{ deslocamento }} as varchar)
        || '/'
        || lpad(cast(({{ ano }} - {{ deslocamento }} + 1) % 100 as varchar), 2, '0')
    )
{%- endmacro %}
