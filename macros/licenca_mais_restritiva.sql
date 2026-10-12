{% macro licenca_mais_restritiva(licencas) -%}
    {%- set ordem = "['livre', 'zona_cinza', 'nc', 'restrito']" -%}
    {%- set entre_posicoes = "), list_position(" ~ ordem ~ ", " -%}
    {{ ordem }}[
        greatest(list_position({{ ordem }}, {{ licencas | join(entre_posicoes) }}))
    ]
{%- endmacro %}
