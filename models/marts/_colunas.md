{% docs col_ano %}
Ano civil da PAM.
{% enddocs %}

{% docs col_produto %}
Identificador do produto no agrobr; nome e calendário em `dim_produto`.
{% enddocs %}

{% docs col_uf %}
Sigla da UF.
{% enddocs %}

{% docs col_area_plantada_ha %}
Área plantada ou destinada à colheita (ha), variável 8331 da tabela 5457 do SIDRA. Nas lavouras permanentes
(café, cacau, laranja) é a área destinada à colheita.
{% enddocs %}

{% docs col_area_colhida_ha %}
Área colhida (ha), variável 216 da tabela 5457.
{% enddocs %}

{% docs col_producao_t %}
Quantidade produzida (t), variável 214 da tabela 5457: algodão herbáceo em caroço, arroz em casca, cacau em
amêndoa, café em grão (total: arábica e canephora, categoria 40139), demais em grão; cana, mandioca e laranja em toneladas.
{% enddocs %}

{% docs col_rendimento_kg_ha %}
Rendimento médio publicado pelo IBGE (kg/ha), variável 112 da tabela 5457.
{% enddocs %}

{% docs col_valor_producao_brl %}
Valor da produção em reais correntes do ano, variável 215 da tabela 5457 (publicada em mil reais).
{% enddocs %}

{% docs col_valor_producao_brl_real %}
Valor da produção em reais de `mes_base_real`: valor corrente × índice do IPCA de `mes_base_real` ÷ média do
índice no ano.
{% enddocs %}

{% docs col_mes_base_real %}
Mês cujos preços medem os valores reais (por padrão, o último mês do IPCA carregado).
{% enddocs %}

{% docs col_licencas %}
Licença mais restritiva entre as fontes que preencheram a linha (`livre` < `zona_cinza` < `nc` < `restrito`).
{% enddocs %}
