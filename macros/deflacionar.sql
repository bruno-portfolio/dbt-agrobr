{% macro deflacionar(valor, indice, indice_base) -%}
    ({{ valor }} * {{ indice_base }} / nullif({{ indice }}, 0))
{%- endmacro %}
