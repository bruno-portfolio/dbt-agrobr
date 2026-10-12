{% macro licenca_da_source(tabela, fonte='agrobr') -%}
    {%- if execute -%}
        '{{ graph.sources["source." ~ project_name ~ "." ~ fonte ~ "." ~ tabela].config.meta.licenca }}'
    {%- else -%}
        cast(null as varchar)
    {%- endif -%}
{%- endmacro %}
