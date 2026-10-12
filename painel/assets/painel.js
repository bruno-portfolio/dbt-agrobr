"use strict";

const ABAS = ["visao", "producao", "municipios", "pam-conab", "precos", "credito", "clima", "metodo"];
const ESTADO = { aba: "visao", produto: "soja", uf: "BR", periodo: null };
const OBJETIVAS = ["objetiva 10×", "objetiva 4×", "objetiva 40×"];
const CONTADOR = { figura: 0, kpi: 0 };
const CACHE = new Map();
const GRAFICOS = [];
let META = null;

const FORMATO = {
  inteiro: new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }),
  decimal1: new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  decimal2: new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  compacto: new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }),
};
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const nada = (v) => v === null || v === undefined || Number.isNaN(v);
const fmtInteiro = (v) => (nada(v) ? "–" : FORMATO.inteiro.format(v));
const fmtCompacto = (v) => (nada(v) ? "–" : FORMATO.compacto.format(v));
const fmtToneladas = (v) => (nada(v) ? "–" : `${fmtCompacto(v)} t`);
const fmtHectares = (v) => (nada(v) ? "–" : `${fmtCompacto(v)} ha`);
const fmtReais = (v) => (nada(v) ? "–" : `R$ ${fmtCompacto(v)}`);
const fmtPct = (v, casas = 1) =>
  nada(v) ? "–" : `${(casas === 1 ? FORMATO.decimal1 : FORMATO.decimal2).format(v * 100)}%`;
const fmtPctSinal = (v) => (nada(v) ? "–" : `${v > 0 ? "+" : ""}${fmtPct(v)}`);
const fmtMes = (iso) => {
  const [ano, mes] = iso.split("-");
  return `${MESES[Number(mes) - 1]}/${ano}`;
};

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function el(tag, propriedades = {}, filhos = []) {
  const no = document.createElement(tag);
  for (const [chave, valor] of Object.entries(propriedades)) {
    if (chave === "texto") no.textContent = valor;
    else if (chave === "classe") no.className = valor;
    else no.setAttribute(chave, valor);
  }
  for (const filho of [].concat(filhos)) if (filho) no.append(filho);
  return no;
}

function cor(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
}

function paraObjetos({ colunas, linhas }) {
  return linhas.map((linha) => Object.fromEntries(colunas.map((coluna, i) => [coluna, linha[i]])));
}

async function carregar(nome) {
  if (!CACHE.has(nome)) {
    CACHE.set(
      nome,
      fetch(`dados/${nome}.json`).then((resposta) => {
        if (!resposta.ok) throw new Error(`dados/${nome}.json: HTTP ${resposta.status}`);
        return resposta.json();
      }),
    );
  }
  return CACHE.get(nome);
}

async function tabela(nome) {
  const chave = `obj:${nome}`;
  if (!CACHE.has(chave)) CACHE.set(chave, carregar(nome).then(paraObjetos));
  return CACHE.get(chave);
}

function produtoInfo(produto) {
  return paraObjetos(META.produtos).find((p) => p.produto === produto);
}

function nomeUf(uf) {
  if (uf === "BR") return "Brasil";
  return paraObjetos(META.ufs).find((u) => u.uf === uf)?.nome ?? uf;
}

function mesBase() {
  return fmtMes(META.mes_base_real);
}

function baseGrafico() {
  return {
    animation: false,
    textStyle: { fontFamily: cor("--fonte"), color: cor("--texto-2"), fontSize: 13 },
    tooltip: {
      backgroundColor: cor("--superficie"),
      borderColor: cor("--borda"),
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: cor("--texto-1"), fontSize: 13 },
      extraCssText: "box-shadow: 0 2px 10px rgba(0,0,0,.12); border-radius: 8px;",
    },
  };
}

function eixoCategoria(dados, extra = {}) {
  return {
    type: "category",
    data: dados,
    axisLine: { lineStyle: { color: cor("--eixo") } },
    axisTick: { show: false },
    axisLabel: { color: cor("--texto-3"), hideOverlap: true, fontSize: 12.5 },
    ...extra,
  };
}

function eixoValor(formatar, extra = {}) {
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: cor("--texto-3"), formatter: (v) => formatar(v), fontSize: 12.5 },
    splitLine: { lineStyle: { color: cor("--grade"), width: 1, type: "solid" } },
    ...extra,
  };
}

function montarGrafico(area) {
  const grafico = echarts.init(area, null, { renderer: "canvas" });
  GRAFICOS.push(grafico);
  return grafico;
}

function redimensionar() {
  for (const grafico of GRAFICOS) grafico.resize();
}

function chaveLinha(corSerie) {
  return `<span style="display:inline-block;width:12px;height:2px;border-radius:1px;background:${corSerie};vertical-align:middle;margin-right:6px"></span>`;
}

function siglaFonte(fonte) {
  const nomes = (fonte ?? "")
    .replace(/^Fontes?: /, "")
    .split(";")
    .map((trecho) => trecho.split(/[,(.]/)[0].trim())
    .filter(Boolean);
  return [...new Set(nomes)].join(" · ");
}

function baixarCsv(titulo, { colunas, linhas }) {
  const celula = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const texto = [colunas.map((c) => celula(c.rotulo)), ...linhas.map((l) => l.map(celula))].map((l) => l.join(";")).join("\r\n");
  const blob = new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" });
  const link = el("a", { href: URL.createObjectURL(blob), download: `${titulo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}.csv` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function figura({ titulo, subtitulo, fonte, largo = false, alto = false, legenda = [], tabelaDados = null }) {
  const objetiva = OBJETIVAS[CONTADOR.figura % OBJETIVAS.length];
  CONTADOR.figura += 1;
  const area = el("div", { classe: `grafico-area${alto ? " alto" : ""}`, role: "img", "aria-label": titulo });
  const filhos = [
    el("div", { classe: "grafico-topo" }, [el("span", { texto: objetiva }), el("span", { texto: siglaFonte(fonte) })]),
    el("h3", { classe: "grafico-titulo", texto: titulo }),
  ];
  if (subtitulo) filhos.push(el("p", { classe: "grafico-subtitulo", texto: subtitulo }));
  if (legenda.length) {
    filhos.push(
      el(
        "ul",
        { classe: "legenda" },
        legenda.map(({ nome, corSerie, forma }) => {
          const chave = el("span", { classe: forma === "caixa" ? "chave-caixa" : "chave-linha" });
          chave.style.background = corSerie;
          return el("li", {}, [chave, el("span", { texto: nome })]);
        }),
      ),
    );
  }
  filhos.push(area);
  const acoes = el("div", { classe: "acoes-figura" });
  if (tabelaDados) {
    const botao = el("button", { type: "button", classe: "botao", texto: "CSV" });
    botao.addEventListener("click", () => baixarCsv(titulo, tabelaDados));
    acoes.append(botao);
  }
  filhos.push(el("div", { classe: "grafico-rodape" }, [el("figcaption", { texto: fonte ?? "" }), acoes]));
  if (tabelaDados) filhos.push(tabelaHtml(tabelaDados));
  return { no: el("figure", { classe: `grafico${largo ? " largo" : ""}` }, filhos), area };
}

function tabelaHtml({ colunas, linhas }) {
  const cabecalho = el(
    "tr",
    {},
    colunas.map((c) => el("th", { classe: c.num ? "num" : "", texto: c.rotulo })),
  );
  const corpo = linhas.map((linha) =>
    el(
      "tr",
      {},
      linha.map((valor, i) => el("td", { classe: colunas[i].num ? "num" : "", texto: valor })),
    ),
  );
  return el("details", { classe: "tabela" }, [
    el("summary", { texto: "Ver tabela" }),
    el("div", { classe: "tabela-rolagem" }, [el("table", {}, [el("thead", {}, [cabecalho]), el("tbody", {}, corpo)])]),
  ]);
}

function kpi(rotulo, valor, delta = null, comparacao = "", topo = null) {
  CONTADOR.kpi += 1;
  const filhos = [
    el("div", { classe: "kpi-topo", texto: topo ?? `campo ${String(CONTADOR.kpi).padStart(2, "0")}` }),
    el("div", { classe: "kpi-valor", texto: valor }),
    el("div", { classe: "kpi-rotulo", texto: rotulo }),
  ];
  if (delta !== null && !nada(delta)) {
    const sinal = el("span", { classe: delta >= 0 ? "sobe" : "desce", texto: `${delta >= 0 ? "▲" : "▼"} ${fmtPctSinal(delta)}` });
    filhos.push(el("div", { classe: "kpi-delta" }, [sinal, document.createTextNode(` ${comparacao}`)]));
  } else if (comparacao) {
    filhos.push(el("div", { classe: "kpi-delta", texto: comparacao }));
  }
  return el("div", { classe: "kpi" }, filhos);
}

function variacao(atual, anterior) {
  if (nada(atual) || nada(anterior) || anterior === 0) return null;
  return atual / anterior - 1;
}

function vazio(mensagem) {
  return el("div", { classe: "vazio", texto: mensagem });
}

function cabecalhoSecao(titulo, intro) {
  return [el("h2", { classe: "secao-titulo", texto: titulo }), el("p", { classe: "secao-intro", texto: intro })];
}

function graficoLinha(area, { x, series, formatar, formatarTooltip = formatar, rotuloFinal = true, yMin = null }) {
  const grafico = montarGrafico(area);
  grafico.setOption({
    ...baseGrafico(),
    grid: { left: 8, right: rotuloFinal ? 72 : 32, top: 16, bottom: 8, containLabel: true },
    xAxis: eixoCategoria(x, { boundaryGap: false }),
    yAxis: eixoValor(formatar, yMin === null ? {} : { min: yMin }),
    tooltip: {
      ...baseGrafico().tooltip,
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: cor("--eixo"), width: 1 } },
      formatter: (itens) => {
        const linhas = itens
          .filter((item) => !nada(item.value))
          .map(
            (item) =>
              `<div>${chaveLinha(item.color)}<b>${escapar(formatarTooltip(item.value))}</b> <span style="color:${cor("--texto-2")}">${escapar(item.seriesName)}</span></div>`,
          );
        return `<div style="color:${cor("--texto-2")};margin-bottom:4px">${escapar(itens[0].axisValueLabel)}</div>${linhas.join("")}`;
      },
    },
    series: series.map((s) => ({
      name: s.nome,
      type: "line",
      data: s.dados,
      connectNulls: false,
      showSymbol: false,
      symbolSize: 8,
      lineStyle: { width: 2, color: s.cor, cap: "round", join: "round" },
      itemStyle: { color: s.cor, borderColor: cor("--superficie"), borderWidth: 2 },
      emphasis: { focus: "none", scale: false },
      endLabel: rotuloFinal
        ? { show: true, color: cor("--texto-2"), fontSize: 12, formatter: (p) => (s.rotulo ? s.rotulo : formatar(p.value)) }
        : { show: false },
    })),
  });
  return grafico;
}

function graficoBarrasH(area, { categorias, valores, corBarra, formatar, formatarTooltip = formatar, extraTooltip = null }) {
  const grafico = montarGrafico(area);
  grafico.setOption({
    ...baseGrafico(),
    grid: { left: 8, right: 64, top: 4, bottom: 8, containLabel: true },
    xAxis: { type: "value", show: false },
    yAxis: eixoCategoria([...categorias].reverse(), { axisLabel: { color: cor("--texto-2"), interval: 0, fontSize: 13 } }),
    tooltip: {
      ...baseGrafico().tooltip,
      trigger: "item",
      formatter: (item) => {
        const indice = categorias.length - 1 - item.dataIndex;
        const extra = extraTooltip ? `<div style="color:${cor("--texto-2")}">${escapar(extraTooltip(indice))}</div>` : "";
        return `<div><b>${escapar(formatarTooltip(item.value))}</b></div><div style="color:${cor("--texto-2")}">${escapar(item.name)}</div>${extra}`;
      },
    },
    series: [
      {
        type: "bar",
        data: [...valores].reverse(),
        barMaxWidth: 24,
        barCategoryGap: "30%",
        itemStyle: { color: corBarra, borderRadius: [0, 4, 4, 0] },
        emphasis: { itemStyle: { opacity: 0.85 } },
        label: { show: true, position: "right", color: cor("--texto-2"), fontSize: 13, formatter: (p) => formatar(p.value) },
      },
    ],
  });
  return grafico;
}

function graficoBarrasV(area, { categorias, valores, corBarra, formatar, formatarTooltip = formatar }) {
  const grafico = montarGrafico(area);
  const ultimo = valores.length - 1;
  grafico.setOption({
    ...baseGrafico(),
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    xAxis: eixoCategoria(categorias),
    yAxis: eixoValor(formatar),
    tooltip: {
      ...baseGrafico().tooltip,
      trigger: "item",
      formatter: (item) => `<div><b>${escapar(formatarTooltip(item.value))}</b></div><div style="color:${cor("--texto-2")}">${escapar(item.name)}</div>`,
    },
    series: [
      {
        type: "bar",
        data: valores.map((v, i) => ({
          value: v,
          label: { show: i === ultimo && !nada(v), position: "top", color: cor("--texto-2"), fontSize: 12, formatter: (p) => formatar(p.value) },
        })),
        barMaxWidth: 24,
        itemStyle: { color: corBarra, borderRadius: [4, 4, 0, 0] },
        emphasis: { itemStyle: { opacity: 0.85 } },
      },
    ],
  });
  return grafico;
}

function graficoDivergente(area, { categorias, valores, formatar }) {
  const grafico = montarGrafico(area);
  const negativo = cor("--div-neg");
  const positivo = cor("--div-pos");
  grafico.setOption({
    ...baseGrafico(),
    grid: { left: 8, right: 56, top: 4, bottom: 8, containLabel: true },
    xAxis: eixoValor(formatar),
    yAxis: eixoCategoria([...categorias].reverse(), { axisLabel: { color: cor("--texto-2"), interval: 0, fontSize: 13 }, axisLine: { show: false } }),
    tooltip: {
      ...baseGrafico().tooltip,
      trigger: "item",
      formatter: (item) => `<div><b>${escapar(formatar(item.value))}</b></div><div style="color:${cor("--texto-2")}">${escapar(item.name)}</div>`,
    },
    series: [
      {
        type: "bar",
        data: [...valores].reverse().map((v) => ({
          value: v,
          itemStyle: { color: v < 0 ? negativo : positivo, borderRadius: v < 0 ? [4, 0, 0, 4] : [0, 4, 4, 0] },
        })),
        barMaxWidth: 18,
        label: { show: true, position: "right", color: cor("--texto-2"), fontSize: 13, formatter: (p) => formatar(p.value) },
        markLine: { silent: true, symbol: "none", label: { show: false }, lineStyle: { color: cor("--eixo"), type: "solid", width: 1 }, data: [{ xAxis: 0 }] },
      },
    ],
  });
  return grafico;
}

function quantis(valores, classes) {
  const ordenados = valores.filter((v) => !nada(v) && v > 0).sort((a, b) => a - b);
  if (!ordenados.length) return [];
  const cortes = [];
  for (let i = 1; i < classes; i += 1) {
    const corte = ordenados[Math.min(ordenados.length - 1, Math.floor((i * ordenados.length) / classes))];
    if (!cortes.length || corte > cortes[cortes.length - 1]) cortes.push(corte);
  }
  return cortes;
}

function classe(valor, cortes) {
  let i = 0;
  while (i < cortes.length && valor >= cortes[i]) i += 1;
  return i;
}

function legendaClasses(cortes, cores, formatar, rotuloZero) {
  const itens = [{ nome: rotuloZero, corSerie: cor("--sem-dado"), forma: "caixa" }];
  const limites = [null, ...cortes, null];
  for (let i = 0; i < cortes.length + 1; i += 1) {
    const de = limites[i];
    const ate = limites[i + 1];
    const nome = de === null ? `abaixo de ${formatar(ate)}` : ate === null ? `${formatar(de)} ou mais` : `${formatar(de)} a ${formatar(ate)}`;
    itens.push({ nome, corSerie: cores[i], forma: "caixa" });
  }
  return itens;
}

function coresSequenciais(n) {
  const passos = ["--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5"].map(cor);
  if (n >= passos.length) return passos;
  return Array.from({ length: n }, (_, i) => passos[Math.round((i * (passos.length - 1)) / Math.max(1, n - 1))]);
}

function hachura() {
  return `repeating-linear-gradient(135deg, ${cor("--sem-dado")} 0 3px, ${cor("--hachura")} 3px 5px)`;
}

function graficoMapa(area, { nomeMapa, dados, cortes, cores, formatar, nomes, larguraBorda, indisponiveis = [] }) {
  const grafico = montarGrafico(area);
  grafico.setOption({
    ...baseGrafico(),
    tooltip: {
      ...baseGrafico().tooltip,
      trigger: "item",
      formatter: (item) => {
        const nome = nomes.get(item.name) ?? item.name;
        const valor = item.data?.indisponivel ? "dado não publicado pela PAM" : nada(item.value) ? "sem produção" : formatar(item.value);
        return `<div><b>${escapar(valor)}</b></div><div style="color:${cor("--texto-2")}">${escapar(nome)}</div>`;
      },
    },
    series: [
      {
        type: "map",
        map: nomeMapa,
        nameProperty: "codarea",
        roam: false,
        aspectScale: 1,
        layoutCenter: ["50%", "50%"],
        layoutSize: "96%",
        selectedMode: false,
        itemStyle: { areaColor: cor("--sem-dado"), borderColor: cor("--superficie"), borderWidth: larguraBorda },
        emphasis: { label: { show: false }, itemStyle: { areaColor: cor("--serie-2"), borderColor: cor("--superficie") } },
        label: { show: false },
        data: [
          ...dados.map((d) => ({ name: d.codigo, value: d.valor, itemStyle: { areaColor: cores[classe(d.valor, cortes)] } })),
          ...indisponiveis.map((codigo) => ({
            name: codigo,
            value: null,
            indisponivel: true,
            itemStyle: { areaColor: cor("--sem-dado"), decal: { symbol: "rect", symbolSize: 1, dashArrayX: [1, 0], dashArrayY: [2, 3], rotation: -Math.PI / 4, color: cor("--hachura") } },
          })),
        ],
      },
    ],
  });
  return grafico;
}

function graficoDispersao(area, { pontos, eixoX, eixoY, formatarX, formatarY, destaque }) {
  const grafico = montarGrafico(area);
  const corDestaque = cor("--serie-1");
  const corFundo = destaque ? cor("--cinza") : corDestaque;
  const serie = (nome, dados, corPonto, z) => ({
    name: nome,
    type: "scatter",
    data: dados.map((p) => ({ value: [p.x, p.y], rotulo: p.rotulo })),
    symbolSize: 9,
    z,
    itemStyle: { color: corPonto, borderColor: cor("--superficie"), borderWidth: 2 },
    emphasis: { scale: 1.4 },
  });
  const series = [serie("demais", pontos.filter((p) => !p.destaque), corFundo, 1)];
  if (destaque) series.push(serie(destaque, pontos.filter((p) => p.destaque), corDestaque, 2));
  grafico.setOption({
    ...baseGrafico(),
    grid: { left: 8, right: 24, top: 16, bottom: 24, containLabel: true },
    xAxis: eixoValor(formatarX, { name: eixoX, nameLocation: "middle", nameGap: 28, nameTextStyle: { color: cor("--texto-2") }, scale: true }),
    yAxis: eixoValor(formatarY, { name: eixoY, nameTextStyle: { color: cor("--texto-2"), align: "left" }, scale: true }),
    tooltip: {
      ...baseGrafico().tooltip,
      trigger: "item",
      formatter: (item) =>
        `<div><b>${escapar(formatarY(item.value[1]))}</b> · <b>${escapar(formatarX(item.value[0]))}</b></div><div style="color:${cor("--texto-2")}">${escapar(item.data.rotulo)}</div>`,
    },
    series,
  });
  return grafico;
}

async function registrarMapa(nivel, uf) {
  const nome = uf === "BR" ? `${nivel}-BR` : `${nivel}-${uf}`;
  if (!echarts.getMap(nome)) {
    const geo = await carregar(`geo/${nivel}`);
    let feicoes = geo.features;
    if (uf !== "BR") {
      const codigo = String(paraObjetos(META.ufs).find((u) => u.uf === uf).codigo_uf);
      feicoes = feicoes.filter((f) => String(f.properties.codarea).startsWith(codigo));
    }
    echarts.registerMap(nome, { type: "FeatureCollection", features: feicoes });
  }
  return nome;
}

function semProduto(produtosValidos, recorte) {
  const nomes = produtosValidos.map((p) => p.nome).join(", ");
  return vazio(`${produtoInfo(ESTADO.produto).nome} não tem ${recorte} nesta base. Escolha um destes produtos: ${nomes}.`);
}

async function renderProducao(raiz) {
  const produto = produtoInfo(ESTADO.produto);
  raiz.append(
    ...cabecalhoSecao(
      "Produção",
      "Área, produção, rendimento e valor da produção publicados pelo IBGE na Produção Agrícola Municipal (PAM), por ano civil.",
    ),
  );
  if (!produto.tem_pam) {
    raiz.append(semProduto(paraObjetos(META.produtos).filter((p) => p.tem_pam), "dados da PAM"));
    return;
  }
  const [brasil, ufs] = await Promise.all([tabela("brasil_ano"), tabela("uf_ano")]);
  const serie = (ESTADO.uf === "BR" ? brasil : ufs.filter((l) => l.uf === ESTADO.uf)).filter((l) => l.produto === ESTADO.produto);
  const anos = serie.map((l) => l.ano);
  const ultimo = serie[serie.length - 1];
  const anterior = serie[serie.length - 2];
  const local = nomeUf(ESTADO.uf);
  raiz.append(
    el("div", { classe: "kpis" }, [
      kpi(`Produção em ${ultimo.ano}`, fmtToneladas(ultimo.producao_t), variacao(ultimo.producao_t, anterior?.producao_t), `sobre ${anterior?.ano}`),
      kpi(`Área plantada ou destinada à colheita`, fmtHectares(ultimo.area_plantada_ha), variacao(ultimo.area_plantada_ha, anterior?.area_plantada_ha), `sobre ${anterior?.ano}`),
      kpi(`Rendimento médio`, nada(ultimo.rendimento_kg_ha) ? "–" : `${fmtInteiro(ultimo.rendimento_kg_ha)} kg/ha`, variacao(ultimo.rendimento_kg_ha, anterior?.rendimento_kg_ha), `sobre ${anterior?.ano}`),
      kpi(`Valor da produção (R$ de ${mesBase()})`, fmtReais(ultimo.valor_producao_brl_real), variacao(ultimo.valor_producao_brl_real, anterior?.valor_producao_brl_real), `sobre ${anterior?.ano}, já corrigido`),
    ]),
  );
  const fonte = `Fonte: IBGE, PAM (tabela 5457). ${produto.nome_pam}.`;
  const grade = el("div", { classe: "grade-graficos" });
  raiz.append(grade);

  const tabelaSerie = {
    colunas: [
      { rotulo: "Ano" },
      { rotulo: "Produção (t)", num: true },
      { rotulo: "Área plantada ou destinada à colheita (ha)", num: true },
      { rotulo: "Rendimento (kg/ha)", num: true },
      { rotulo: `Valor (R$ de ${mesBase()})`, num: true },
    ],
    linhas: serie.map((l) => [String(l.ano), fmtInteiro(l.producao_t), fmtInteiro(l.area_plantada_ha), fmtInteiro(l.rendimento_kg_ha), fmtInteiro(l.valor_producao_brl_real)]),
  };
  const producao = figura({ titulo: `Produção de ${produto.nome.toLowerCase()} · ${local}`, subtitulo: "Toneladas por ano", fonte, tabelaDados: tabelaSerie });
  grade.append(producao.no);
  graficoLinha(producao.area, { x: anos, series: [{ nome: "Produção", cor: cor("--serie-1"), dados: serie.map((l) => l.producao_t) }], formatar: fmtToneladas, formatarTooltip: (v) => `${fmtInteiro(v)} t` });

  const rendimento = figura({
    titulo: `Rendimento médio · ${local}`,
    subtitulo: "Quilos por hectare colhido, como publica o IBGE",
    fonte,
    tabelaDados: { colunas: [{ rotulo: "Ano" }, { rotulo: "Rendimento (kg/ha)", num: true }], linhas: serie.map((l) => [String(l.ano), fmtInteiro(l.rendimento_kg_ha)]) },
  });
  grade.append(rendimento.no);
  graficoLinha(rendimento.area, { x: anos, series: [{ nome: "Rendimento", cor: cor("--serie-1"), dados: serie.map((l) => l.rendimento_kg_ha) }], formatar: (v) => `${fmtInteiro(v)}`, formatarTooltip: (v) => `${fmtInteiro(v)} kg/ha` });

  if (ESTADO.uf === "BR") {
    const doAno = ufs.filter((l) => l.produto === ESTADO.produto && l.ano === ultimo.ano && l.producao_t > 0).sort((a, b) => b.producao_t - a.producao_t);
    const top = doAno.slice(0, 10);
    const demais = doAno.slice(10).reduce((s, l) => s + l.producao_t, 0);
    const categorias = top.map((l) => nomeUf(l.uf)).concat(demais > 0 ? [`Demais ${doAno.length - 10} UFs`] : []);
    const valores = top.map((l) => l.producao_t).concat(demais > 0 ? [demais] : []);
    const ranking = figura({
      titulo: `Maiores produtores em ${ultimo.ano}`,
      subtitulo: "Produção por UF, em toneladas",
      fonte,
      tabelaDados: {
        colunas: [{ rotulo: "UF" }, { rotulo: "Produção (t)", num: true }, { rotulo: "Participação no Brasil", num: true }],
        linhas: doAno.map((l) => [nomeUf(l.uf), fmtInteiro(l.producao_t), fmtPct(l.participacao_producao_brasil)]),
      },
    });
    grade.append(ranking.no);
    graficoBarrasH(ranking.area, {
      categorias,
      valores,
      corBarra: cor("--serie-1"),
      formatar: fmtToneladas,
      formatarTooltip: (v) => `${fmtInteiro(v)} t`,
      extraTooltip: (i) => (i < top.length ? `${fmtPct(top[i].participacao_producao_brasil)} do Brasil` : ""),
    });

    const nomeMapa = await registrarMapa("uf", "BR");
    const ufsObj = paraObjetos(META.ufs);
    const dadosMapa = doAno.map((l) => ({ codigo: String(ufsObj.find((u) => u.uf === l.uf).codigo_uf), valor: l.producao_t }));
    const cortes = quantis(dadosMapa.map((d) => d.valor), 5);
    const cores = coresSequenciais(cortes.length + 1);
    const mapa = figura({
      titulo: `Produção por UF em ${ultimo.ano}`,
      subtitulo: "Classes de produção (quintis das UFs produtoras)",
      fonte: `${fonte} Malha: IBGE.`,
      legenda: legendaClasses(cortes, cores, fmtToneladas, "sem produção"),
      tabelaDados: {
        colunas: [{ rotulo: "UF" }, { rotulo: "Produção (t)", num: true }],
        linhas: doAno.map((l) => [nomeUf(l.uf), fmtInteiro(l.producao_t)]),
      },
    });
    grade.append(mapa.no);
    graficoMapa(mapa.area, {
      nomeMapa,
      dados: dadosMapa,
      cortes,
      cores,
      formatar: (v) => `${fmtInteiro(v)} t`,
      nomes: new Map(ufsObj.map((u) => [String(u.codigo_uf), u.nome])),
      larguraBorda: 1,
    });
  }
  const valor = figura({
    titulo: `Valor da produção · ${local}`,
    subtitulo: `Reais de ${mesBase()}, corrigidos pelo IPCA (média do ano)`,
    fonte: `${fonte} IPCA: IBGE, via SGS 433 do Banco Central.`,
    largo: true,
    tabelaDados: { colunas: [{ rotulo: "Ano" }, { rotulo: `Valor (R$ de ${mesBase()})`, num: true }], linhas: serie.map((l) => [String(l.ano), fmtInteiro(l.valor_producao_brl_real)]) },
  });
  grade.append(valor.no);
  graficoLinha(valor.area, { x: anos, series: [{ nome: "Valor real", cor: cor("--serie-1"), dados: serie.map((l) => l.valor_producao_brl_real) }], formatar: fmtReais });
}

async function renderMunicipios(raiz) {
  const produto = produtoInfo(ESTADO.produto);
  raiz.append(
    ...cabecalhoSecao(
      "Municípios",
      "Produção municipal da PAM. Em cinza, os municípios sem a lavoura no ano; hachurados, os que a PAM não publicou (dado não disponível).",
    ),
  );
  if (!produto.tem_pam) {
    raiz.append(semProduto(paraObjetos(META.produtos).filter((p) => p.tem_pam), "dados da PAM"));
    return;
  }
  const [municipal, nomes] = await Promise.all([tabela(`municipio_ano/${ESTADO.produto}`), tabela("municipios")]);
  const ano = Number(ESTADO.periodo);
  const nomePorCodigo = new Map(nomes.map((m) => [String(m.cod_municipio), `${m.nome} (${m.uf})`]));
  const ufPorCodigo = new Map(nomes.map((m) => [String(m.cod_municipio), m.uf]));
  const doLocal = municipal.filter((l) => l.ano === ano && (ESTADO.uf === "BR" || ufPorCodigo.get(String(l.cod_municipio)) === ESTADO.uf));
  const doAno = doLocal.filter((l) => l.producao_t > 0).sort((a, b) => b.producao_t - a.producao_t);
  const indisponiveis = doLocal.filter((l) => nada(l.producao_t));
  const avisoIndisponiveis = indisponiveis.length
    ? ` ${fmtInteiro(indisponiveis.length)} ${indisponiveis.length === 1 ? "município sem dado publicado pela PAM" : "municípios sem dado publicado pela PAM"}.`
    : "";
  if (!doAno.length) {
    raiz.append(vazio(`Nenhum município de ${nomeUf(ESTADO.uf)} produziu ${produto.nome.toLowerCase()} em ${ano}, segundo a PAM.${avisoIndisponiveis}`));
    return;
  }
  const fonte = `Fonte: IBGE, PAM (tabela 5457). ${produto.nome_pam}. Malha: IBGE.`;
  raiz.append(
    el("div", { classe: "kpis" }, [
      kpi(`Municípios produtores em ${ano}`, fmtInteiro(doAno.length), null, nomeUf(ESTADO.uf)),
      kpi("Maior produtor", nomePorCodigo.get(String(doAno[0].cod_municipio)), null, `${fmtToneladas(doAno[0].producao_t)} · ${fmtPct(doAno[0].participacao_producao_uf)} da UF`),
      kpi("10 maiores somados", fmtToneladas(doAno.slice(0, 10).reduce((s, l) => s + l.producao_t, 0)), null, `${fmtPct(doAno.slice(0, 10).reduce((s, l) => s + l.producao_t, 0) / doAno.reduce((s, l) => s + l.producao_t, 0))} do total`),
    ]),
  );
  const grade = el("div", { classe: "grade-graficos" });
  raiz.append(grade);
  const nomeMapa = await registrarMapa("municipio", ESTADO.uf);
  const comContorno = new Set(echarts.getMap(nomeMapa).geoJSON.features.map((f) => String(f.properties.codarea)));
  const semContorno = doAno.filter((l) => !comContorno.has(String(l.cod_municipio)));
  const avisoContorno = semContorno.length
    ? ` Sem contorno na malha do IBGE usada, fora do mapa: ${semContorno.map((l) => `${nomePorCodigo.get(String(l.cod_municipio))}, ${fmtToneladas(l.producao_t)}`).join("; ")}.`
    : "";
  const dadosMapa = doAno.map((l) => ({ codigo: String(l.cod_municipio), valor: l.producao_t }));
  const cortes = quantis(dadosMapa.map((d) => d.valor), 5);
  const cores = coresSequenciais(cortes.length + 1);
  const colunasMunicipio = [
    { rotulo: "Município" },
    { rotulo: "Produção (t)", num: true },
    { rotulo: "Área plantada ou destinada à colheita (ha)", num: true },
    { rotulo: "Rendimento (kg/ha)", num: true },
    { rotulo: "Participação na UF", num: true },
  ];
  const linhaMunicipio = (l) => [
    nomePorCodigo.get(String(l.cod_municipio)),
    nada(l.producao_t) ? "não publicado" : fmtInteiro(l.producao_t),
    fmtInteiro(l.area_plantada_ha),
    fmtInteiro(l.rendimento_kg_ha),
    fmtPct(l.participacao_producao_uf),
  ];
  const legendaMapa = legendaClasses(cortes, cores, fmtToneladas, "sem produção");
  if (indisponiveis.length) legendaMapa.splice(1, 0, { nome: "dado não publicado", corSerie: hachura(), forma: "caixa" });
  const mapa = figura({
    titulo: `Produção de ${produto.nome.toLowerCase()} por município em ${ano} · ${nomeUf(ESTADO.uf)}`,
    subtitulo: `Classes de produção (quintis dos municípios produtores).${avisoIndisponiveis}${avisoContorno}`,
    fonte,
    largo: true,
    alto: true,
    legenda: legendaMapa,
    tabelaDados: { colunas: colunasMunicipio, linhas: [...doAno, ...indisponiveis].map(linhaMunicipio) },
  });
  grade.append(mapa.no);
  graficoMapa(mapa.area, {
    nomeMapa,
    dados: dadosMapa,
    cortes,
    cores,
    formatar: (v) => `${fmtInteiro(v)} t`,
    nomes: nomePorCodigo,
    larguraBorda: 0.3,
    indisponiveis: indisponiveis.map((l) => String(l.cod_municipio)),
  });

  const top = doAno.slice(0, 15);
  const ranking = figura({
    titulo: `Maiores municípios produtores em ${ano}`,
    subtitulo: "Toneladas",
    fonte,
    largo: true,
    tabelaDados: { colunas: colunasMunicipio, linhas: top.map(linhaMunicipio) },
  });
  grade.append(ranking.no);
  ranking.area.style.height = "460px";
  graficoBarrasH(ranking.area, {
    categorias: top.map((l) => nomePorCodigo.get(String(l.cod_municipio))),
    valores: top.map((l) => l.producao_t),
    corBarra: cor("--serie-1"),
    formatar: fmtToneladas,
    formatarTooltip: (v) => `${fmtInteiro(v)} t`,
    extraTooltip: (i) => `${fmtPct(top[i].participacao_producao_uf)} da produção da UF`,
  });
}

function somaPorSafra(linhas, campo) {
  const total = new Map();
  for (const l of linhas) {
    if (nada(l[campo])) continue;
    total.set(l.safra, (total.get(l.safra) ?? 0) + l[campo]);
  }
  return total;
}

async function renderPamConab(raiz) {
  const produto = produtoInfo(ESTADO.produto);
  raiz.append(
    ...cabecalhoSecao(
      "PAM × CONAB",
      "O IBGE (PAM) e a CONAB medem a mesma safra por métodos diferentes. A safra 2023/24 corresponde à PAM de 2024. A diferença entre as duas não é erro de nenhuma delas.",
    ),
  );
  if (!produto.tem_conab) {
    raiz.append(semProduto(paraObjetos(META.produtos).filter((p) => p.tem_conab), "estimativa da CONAB"));
    return;
  }
  const todas = (await tabela("uf_safra")).filter((l) => l.produto === ESTADO.produto);
  const linhas = ESTADO.uf === "BR" ? todas : todas.filter((l) => l.uf === ESTADO.uf);
  const pam = somaPorSafra(linhas, "pam_producao_t");
  const conab = somaPorSafra(linhas, "conab_producao_t");
  const safras = [...new Set([...pam.keys(), ...conab.keys()])].sort();
  const safra = ESTADO.periodo;
  const local = nomeUf(ESTADO.uf);
  const pamSafra = pam.get(safra);
  const conabSafra = conab.get(safra);
  raiz.append(
    el("div", { classe: "kpis" }, [
      kpi(`PAM · safra ${safra}`, fmtToneladas(pamSafra), null, `ano civil ${Number(safra.slice(0, 4)) + 1}`),
      kpi(`CONAB · safra ${safra}`, fmtToneladas(conabSafra), null, origemConab(linhas, safra, !pamBrasilSafra(todas, safra))),
      kpi("CONAB em relação à PAM", fmtPctSinal(variacao(conabSafra, pamSafra)), null, local),
    ]),
  );
  const fonte = `Fontes: IBGE, PAM (tabela 5457); CONAB, série histórica e levantamentos mensais (o mais recente: ${META.conab_ultimo}).`;
  const grade = el("div", { classe: "grade-graficos" });
  raiz.append(grade);
  const pamBrasil = somaPorSafra(todas, "pam_producao_t");
  const previsoes = safras.filter((s) => conab.has(s) && !pamBrasil.has(s));
  const avisoPrevisao = previsoes.length
    ? ` ${previsoes.length === 1 ? `A safra ${previsoes[0]} é previsão` : `As safras ${previsoes.join(", ")} são previsões`} da CONAB; a PAM correspondente ainda não saiu.`
    : "";
  const linha = figura({
    titulo: `Produção de ${produto.nome.toLowerCase()} por safra · ${local}`,
    subtitulo: `Toneladas.${avisoPrevisao}`,
    fonte,
    legenda: [
      { nome: "PAM (IBGE)", corSerie: cor("--serie-1") },
      { nome: "CONAB", corSerie: cor("--serie-2") },
    ],
    tabelaDados: {
      colunas: [{ rotulo: "Safra" }, { rotulo: "PAM (t)", num: true }, { rotulo: "CONAB (t)", num: true }, { rotulo: "CONAB − PAM", num: true }],
      linhas: safras.map((s) => [s, fmtInteiro(pam.get(s)), fmtInteiro(conab.get(s)), fmtPctSinal(variacao(conab.get(s), pam.get(s)))]),
    },
    largo: ESTADO.uf !== "BR",
  });
  grade.append(linha.no);
  graficoLinha(linha.area, {
    x: safras,
    series: [
      { nome: "PAM (IBGE)", rotulo: "PAM", cor: cor("--serie-1"), dados: safras.map((s) => pam.get(s) ?? null) },
      { nome: "CONAB", rotulo: "CONAB", cor: cor("--serie-2"), dados: safras.map((s) => conab.get(s) ?? null) },
    ],
    formatar: fmtToneladas,
    formatarTooltip: (v) => `${fmtInteiro(v)} t`,
  });
  await figuraLevantamentos(grade, produto, local, fonte, linhas);

  if (ESTADO.uf === "BR") {
    const minimo = 10000;
    const porUf = todas
      .filter((l) => l.safra === safra && l.pam_producao_t >= minimo && !nada(l.conab_producao_t))
      .map((l) => ({ uf: l.uf, dif: l.conab_menos_pam_producao_pct }))
      .sort((a, b) => b.dif - a.dif);
    const divergente = figura({
      titulo: `Diferença da CONAB em relação à PAM por UF · ${safra}`,
      subtitulo: `UFs com ao menos ${fmtInteiro(minimo)} t na PAM. Vermelho: CONAB acima; azul: CONAB abaixo.`,
      fonte,
      tabelaDados: {
        colunas: [{ rotulo: "UF" }, { rotulo: "CONAB − PAM", num: true }],
        linhas: porUf.map((l) => [nomeUf(l.uf), fmtPctSinal(l.dif)]),
      },
    });
    grade.append(divergente.no);
    divergente.area.style.height = `${Math.max(240, porUf.length * 26 + 40)}px`;
    if (porUf.length) {
      graficoDivergente(divergente.area, { categorias: porUf.map((l) => nomeUf(l.uf)), valores: porUf.map((l) => l.dif), formatar: fmtPctSinal });
    } else {
      divergente.area.replaceWith(vazio(`Sem PAM para a safra ${safra} ainda.`));
    }
  }
}

function origemConab(linhas, safra, previsao) {
  const exemplo = linhas.find((l) => l.safra === safra && !nada(l.conab_producao_t));
  if (!exemplo) return "sem estimativa";
  if (exemplo.conab_origem === "serie_historica") return "série histórica revisada";
  const data = exemplo.conab_data_publicacao ? ` de ${fmtDia(exemplo.conab_data_publicacao)}` : "";
  return `${exemplo.conab_levantamento}º levantamento${data}${previsao ? ", previsão" : ""}`;
}

function pamBrasilSafra(linhas, safra) {
  return linhas.some((l) => l.safra === safra && !nada(l.pam_producao_t));
}

function fmtDia(iso) {
  return iso.slice(0, 10).split("-").reverse().join("/");
}

function destinoResumo(rotulo) {
  if (rotulo === "série histórica") return "à série histórica revisada";
  if (rotulo.startsWith("revisão")) return `à ${rotulo}`;
  return `ao ${rotulo}`;
}

async function figuraLevantamentos(grade, produto, local, fonte, linhas) {
  const todos = (await tabela("estimativa_levantamento")).filter((l) => l.produto === ESTADO.produto);
  const primeira = todos.map((l) => l.safra).sort()[0];
  const daSafra = todos.filter((l) => l.safra === ESTADO.periodo && (ESTADO.uf === "BR" || l.uf === ESTADO.uf));
  const porLevantamento = new Map();
  for (const l of daSafra) {
    const atual = porLevantamento.get(l.levantamento) ?? { rotulo: `${l.levantamento}º`, data: l.data_publicacao, producao: null };
    if (!nada(l.producao_t)) atual.producao = (atual.producao ?? 0) + l.producao_t;
    porLevantamento.set(l.levantamento, atual);
  }
  const numeros = [...porLevantamento.keys()];
  const primeiroLevantamento = Math.min(...numeros);
  const ultimoLevantamento = Math.max(...numeros);
  const pontos = numeros.length
    ? Array.from({ length: ultimoLevantamento - primeiroLevantamento + 1 }, (_, i) => {
        const n = primeiroLevantamento + i;
        return porLevantamento.get(n) ?? { rotulo: `${n}º`, data: null, producao: null, ausente: true };
      })
    : [];
  const ausentes = pontos.filter((p) => p.ausente).map((p) => p.rotulo);
  const vigentes = linhas.filter((l) => l.safra === ESTADO.periodo && !nada(l.conab_producao_t));
  const exemplo = vigentes[0];
  if (pontos.length && exemplo && (exemplo.conab_origem === "serie_historica" || exemplo.conab_data_publicacao > porLevantamento.get(ultimoLevantamento).data)) {
    pontos.push({
      rotulo: exemplo.conab_origem === "serie_historica" ? "série histórica" : `revisão de ${fmtDia(exemplo.conab_data_publicacao)}`,
      data: exemplo.conab_data_publicacao,
      producao: vigentes.reduce((soma, l) => soma + l.conab_producao_t, 0),
    });
  }
  const resumo =
    pontos.length > 1
      ? ` Do ${pontos[0].rotulo} levantamento ${destinoResumo(pontos[pontos.length - 1].rotulo)}: ${fmtPctSinal(variacao(pontos[pontos.length - 1].producao, pontos[0].producao))}.`
      : "";
  const revisoes = figura({
    titulo: `Estimativas da CONAB para a safra ${ESTADO.periodo} · ${local}`,
    subtitulo: `Produção estimada em cada levantamento mensal, em toneladas: o 1º sai em outubro e o 12º em setembro do ano seguinte; depois, a CONAB ainda revisa o número. O eixo não começa em zero.${numeros.length && primeiroLevantamento > 1 ? ` A estimativa de ${produto.nome.toLowerCase()} entra a partir do ${primeiroLevantamento}º.` : ""}${resumo}${ausentes.length ? ` Sem o ${ausentes.join(", ")} levantamento: o agrobr não leu esse boletim.` : ""}`,
    fonte,
    largo: true,
    tabelaDados: {
      colunas: [{ rotulo: "Estimativa" }, { rotulo: "Publicação" }, { rotulo: "Produção (t)", num: true }, { rotulo: "Sobre a anterior", num: true }],
      linhas: pontos.map((p, i) => [p.rotulo, p.data ? fmtDia(p.data) : "—", p.ausente ? "não lido" : fmtInteiro(p.producao), i ? fmtPctSinal(variacao(p.producao, pontos[i - 1].producao)) : "—"]),
    },
  });
  grade.append(revisoes.no);
  if (!pontos.length) {
    revisoes.area.replaceWith(
      vazio(`Os levantamentos mensais da CONAB estão aqui a partir da safra ${primeira}; antes dela, só a série histórica revisada.`),
    );
    return;
  }
  graficoLinha(revisoes.area, {
    x: pontos.map((p) => p.rotulo),
    series: [{ nome: `CONAB, ${produto.nome.toLowerCase()}`, rotulo: "CONAB", cor: cor("--serie-2"), dados: pontos.map((p) => p.producao) }],
    formatar: fmtToneladas,
    formatarTooltip: (v) => `${fmtInteiro(v)} t`,
    yMin: (v) => {
      const folga = Math.max(v.max - v.min, v.max * 0.05);
      const passo = 10 ** Math.floor(Math.log10(folga));
      return Math.max(0, Math.floor((v.min - folga) / passo) * passo);
    },
  });
}

async function renderPrecos(raiz) {
  const produto = produtoInfo(ESTADO.produto);
  raiz.append(
    ...cabecalhoSecao(
      "Preços",
      "Média mensal do indicador diário do CEPEA/ESALQ, na unidade em que o CEPEA publica. O preço é de uma praça, não de uma UF.",
    ),
  );
  if (!produto.tem_preco) {
    raiz.append(semProduto(paraObjetos(META.produtos).filter((p) => p.tem_preco), "indicador do CEPEA"));
    return;
  }
  const meses = (await tabela("preco_mes")).filter((l) => l.produto === ESTADO.produto);
  const indicador = paraObjetos(META.indicadores).find((i) => i.produto === ESTADO.produto);
  const completos = meses.filter((l) => !nada(l.preco_medio_real));
  const ultimo = completos[completos.length - 1];
  const anoAntes = completos.find((l) => l.mes === `${Number(ultimo.mes.slice(0, 4)) - 1}${ultimo.mes.slice(4)}`);
  const unidade = indicador.unidade_publicada;
  const fmtPreco = (v) => (nada(v) ? "–" : FORMATO.decimal2.format(v));
  raiz.append(
    el("div", { classe: "kpis" }, [
      kpi(`Média de ${fmtMes(ultimo.mes)}`, fmtPreco(ultimo.preco_medio), null, unidade),
      kpi("Em 12 meses, nominal", fmtPctSinal(variacao(ultimo.preco_medio, anoAntes?.preco_medio)), null, `sobre ${anoAntes ? fmtMes(anoAntes.mes) : "–"}`),
      kpi("Em 12 meses, descontada a inflação", fmtPctSinal(variacao(ultimo.preco_medio_real, anoAntes?.preco_medio_real)), null, "pelo IPCA"),
    ]),
  );
  const parcial = meses[meses.length - 1];
  const notaParcial = nada(parcial.preco_medio_real) ? ` ${fmtMes(parcial.mes)} é parcial (${parcial.dias_com_preco} dias) e ainda sem IPCA.` : "";
  const fonte = `Fonte: CEPEA/ESALQ, ${indicador.indicador} (licença CC BY-NC 4.0). IPCA: IBGE, via SGS 433 do Banco Central.`;
  const observacao = indicador.observacao ? `${indicador.referencia}; ${indicador.observacao}` : indicador.referencia;
  const grade = el("div", { classe: "grade-graficos" });
  raiz.append(grade);
  const linha = figura({
    titulo: indicador.indicador,
    subtitulo: `${unidade}, média mensal, ${observacao}.${notaParcial}`,
    fonte,
    largo: true,
    legenda: [
      { nome: "Nominal", corSerie: cor("--serie-1") },
      { nome: `Real (R$ de ${mesBase()})`, corSerie: cor("--serie-2") },
    ],
    tabelaDados: {
      colunas: [{ rotulo: "Mês" }, { rotulo: `Nominal (${unidade})`, num: true }, { rotulo: `Real, R$ de ${mesBase()}`, num: true }, { rotulo: "Dias com preço", num: true }],
      linhas: [...meses].reverse().map((l) => [fmtMes(l.mes), fmtPreco(l.preco_medio), fmtPreco(l.preco_medio_real), String(l.dias_com_preco)]),
    },
  });
  grade.append(linha.no);
  graficoLinha(linha.area, {
    x: meses.map((l) => fmtMes(l.mes)),
    series: [
      { nome: "Nominal", rotulo: "Nominal", cor: cor("--serie-1"), dados: meses.map((l) => l.preco_medio) },
      { nome: `Real (R$ de ${mesBase()})`, rotulo: "Real", cor: cor("--serie-2"), dados: meses.map((l) => l.preco_medio_real) },
    ],
    formatar: (v) => fmtCompacto(v),
    formatarTooltip: fmtPreco,
    rotuloFinal: false,
  });
}

async function renderCredito(raiz) {
  const produto = produtoInfo(ESTADO.produto);
  raiz.append(
    ...cabecalhoSecao(
      "Crédito rural",
      "Crédito de custeio contratado no Sistema de Operações do Crédito Rural (SICOR), por safra de julho a junho do mês de emissão do contrato.",
    ),
  );
  if (!produto.tem_credito) {
    raiz.append(semProduto(paraObjetos(META.produtos).filter((p) => p.tem_credito), "crédito no SICOR"));
    return;
  }
  const todas = (await tabela("credito_uf_safra")).filter((l) => l.produto === ESTADO.produto && l.finalidade === "custeio");
  const linhas = ESTADO.uf === "BR" ? todas : todas.filter((l) => l.uf === ESTADO.uf);
  const real = somaPorSafra(linhas, "valor_brl_real");
  const contratos = somaPorSafra(linhas, "qtd_contratos");
  const safras = [...real.keys()].sort();
  const safra = ESTADO.periodo;
  const local = nomeUf(ESTADO.uf);
  const anterior = safras[safras.indexOf(safra) - 1];
  raiz.append(
    el("div", { classe: "kpis" }, [
      kpi(`Custeio na safra ${safra} (R$ de ${mesBase()})`, fmtReais(real.get(safra)), variacao(real.get(safra), real.get(anterior)), anterior ? `sobre ${anterior}` : ""),
      kpi("Contratos", fmtInteiro(contratos.get(safra)), variacao(contratos.get(safra), contratos.get(anterior)), anterior ? `sobre ${anterior}` : ""),
      kpi(`Valor médio por contrato (R$ de ${mesBase()})`, fmtReais(real.get(safra) / contratos.get(safra)), null, local),
    ]),
  );
  const fonte = "Fonte: Banco Central, SICOR, Matriz de Dados do Crédito Rural (licença ODbL 1.0). IPCA: IBGE, via SGS 433.";
  const grade = el("div", { classe: "grade-graficos" });
  raiz.append(grade);
  const barras = figura({
    titulo: `Custeio de ${produto.nome.toLowerCase()} por safra · ${local}`,
    subtitulo: `Reais de ${mesBase()}, corrigidos pela média do IPCA na safra`,
    fonte,
    tabelaDados: {
      colunas: [{ rotulo: "Safra" }, { rotulo: `Valor (R$ de ${mesBase()})`, num: true }, { rotulo: "Contratos", num: true }],
      linhas: safras.map((s) => [s, fmtInteiro(real.get(s)), fmtInteiro(contratos.get(s))]),
    },
  });
  grade.append(barras.no);
  graficoBarrasV(barras.area, { categorias: safras, valores: safras.map((s) => real.get(s)), corBarra: cor("--serie-1"), formatar: fmtReais });

  const medio = figura({
    titulo: `Valor médio por contrato · ${local}`,
    subtitulo: `Reais de ${mesBase()}`,
    fonte,
    tabelaDados: {
      colunas: [{ rotulo: "Safra" }, { rotulo: `Valor médio (R$ de ${mesBase()})`, num: true }],
      linhas: safras.map((s) => [s, fmtInteiro(real.get(s) / contratos.get(s))]),
    },
  });
  grade.append(medio.no);
  graficoLinha(medio.area, { x: safras, series: [{ nome: "Valor médio", cor: cor("--serie-1"), dados: safras.map((s) => real.get(s) / contratos.get(s)) }], formatar: fmtReais });

  if (ESTADO.uf === "BR") {
    const daSafra = todas.filter((l) => l.safra === safra && l.valor_brl_real > 0).sort((a, b) => b.valor_brl_real - a.valor_brl_real);
    const top = daSafra.slice(0, 10);
    const ranking = figura({
      titulo: `Custeio por UF na safra ${safra}`,
      subtitulo: `Reais de ${mesBase()}`,
      fonte,
      largo: true,
      tabelaDados: {
        colunas: [{ rotulo: "UF" }, { rotulo: `Valor (R$ de ${mesBase()})`, num: true }, { rotulo: "Contratos", num: true }, { rotulo: "Participação", num: true }],
        linhas: daSafra.map((l) => [nomeUf(l.uf), fmtInteiro(l.valor_brl_real), fmtInteiro(l.qtd_contratos), fmtPct(l.participacao_valor_brasil)]),
      },
    });
    grade.append(ranking.no);
    graficoBarrasH(ranking.area, {
      categorias: top.map((l) => nomeUf(l.uf)),
      valores: top.map((l) => l.valor_brl_real),
      corBarra: cor("--serie-1"),
      formatar: fmtReais,
      extraTooltip: (i) => `${fmtPct(top[i].participacao_valor_brasil)} do total · ${fmtInteiro(top[i].qtd_contratos)} contratos`,
    });
  }
}

async function renderClima(raiz) {
  const produto = produtoInfo(ESTADO.produto);
  raiz.append(
    ...cabecalhoSecao(
      "Clima e rendimento",
      "Chuva de julho a junho nas células da grade do NASA POWER onde estão os municípios que plantaram o produto, ponderada pela área plantada, ao lado do rendimento médio da PAM. Mostra associação, não causa: o total do ano agrícola não diz como a chuva se distribuiu no ciclo, e parte da colheita do milho de segunda safra, do feijão de terceira safra e do algodão acontece depois de junho.",
    ),
  );
  const validos = paraObjetos(META.produtos).filter((p) => p.janela_jul_jun && p.tem_pam);
  if (!produto.janela_jul_jun || !produto.tem_pam) {
    const nomes = validos.map((p) => p.nome).join(", ");
    raiz.append(
      vazio(
        `O clima de julho a junho só é comparado com o rendimento das lavouras de grãos plantadas na primavera e no verão; ${produto.nome} fica de fora (ver Método e fontes). Escolha um destes produtos: ${nomes}.`,
      ),
    );
    return;
  }
  const todas = (await tabela("uf_safra")).filter(
    (l) => l.produto === ESTADO.produto && !nada(l.clima_precip_jul_jun_mm) && !nada(l.pam_rendimento_kg_ha) && l.pam_area_plantada_ha > 0,
  );
  if (!todas.length) {
    raiz.append(vazio("Sem dados de clima completos para este produto."));
    return;
  }
  const fonte = "Fontes: NASA POWER (Daily API v2.10.0, reanálise MERRA-2) e IBGE, PAM (tabela 5457).";
  const grade = el("div", { classe: "grade-graficos" });
  raiz.append(grade);
  const pontos = todas.map((l) => ({ x: l.clima_precip_jul_jun_mm, y: l.pam_rendimento_kg_ha, rotulo: `${nomeUf(l.uf)} · safra ${l.safra}`, destaque: l.uf === ESTADO.uf }));
  const temUf = ESTADO.uf !== "BR" && todas.some((l) => l.uf === ESTADO.uf);
  const ufsComArea = new Set(todas.map((l) => l.uf)).size;
  const sobreUf = ESTADO.uf === "BR" ? "" : temUf ? `; ${nomeUf(ESTADO.uf)} em destaque` : `; ${nomeUf(ESTADO.uf)} não tem área plantada de ${produto.nome.toLowerCase()} na PAM`;
  const dispersao = figura({
    titulo: `Chuva no ano agrícola × rendimento de ${produto.nome.toLowerCase()}`,
    subtitulo: `Cada ponto é uma UF em uma safra; ${ufsComArea} ${ufsComArea === 1 ? "UF tem" : "UFs têm"} área plantada na PAM${sobreUf}`,
    fonte,
    largo: true,
    legenda: temUf ? [{ nome: nomeUf(ESTADO.uf), corSerie: cor("--serie-1"), forma: "caixa" }, { nome: "Demais UFs", corSerie: cor("--cinza"), forma: "caixa" }] : [],
    tabelaDados: {
      colunas: [{ rotulo: "UF" }, { rotulo: "Safra" }, { rotulo: "Chuva jul–jun (mm)", num: true }, { rotulo: "Rendimento (kg/ha)", num: true }],
      linhas: todas.map((l) => [nomeUf(l.uf), l.safra, fmtInteiro(l.clima_precip_jul_jun_mm), fmtInteiro(l.pam_rendimento_kg_ha)]),
    },
  });
  grade.append(dispersao.no);
  dispersao.area.style.height = "420px";
  graficoDispersao(dispersao.area, {
    pontos,
    eixoX: "Chuva de julho a junho (mm)",
    eixoY: "Rendimento (kg/ha)",
    formatarX: (v) => `${fmtInteiro(v)} mm`,
    formatarY: (v) => `${fmtInteiro(v)} kg/ha`,
    destaque: temUf ? nomeUf(ESTADO.uf) : null,
  });
  if (ESTADO.uf !== "BR") {
    const daUf = todas.filter((l) => l.uf === ESTADO.uf).sort((a, b) => a.safra.localeCompare(b.safra));
    if (daUf.length) {
      const safras = daUf.map((l) => l.safra);
      const chuva = figura({
        titulo: `Chuva de julho a junho · ${nomeUf(ESTADO.uf)}`,
        subtitulo: "Milímetros, ponderados pela área plantada",
        fonte,
        tabelaDados: { colunas: [{ rotulo: "Safra" }, { rotulo: "Chuva jul–jun (mm)", num: true }], linhas: daUf.map((l) => [l.safra, fmtInteiro(l.clima_precip_jul_jun_mm)]) },
      });
      grade.append(chuva.no);
      graficoLinha(chuva.area, { x: safras, series: [{ nome: "Chuva", cor: cor("--serie-1"), dados: daUf.map((l) => l.clima_precip_jul_jun_mm) }], formatar: (v) => `${fmtInteiro(v)} mm` });
      const rendimento = figura({
        titulo: `Rendimento · ${nomeUf(ESTADO.uf)}`,
        subtitulo: "Quilos por hectare colhido (PAM)",
        fonte,
        tabelaDados: { colunas: [{ rotulo: "Safra" }, { rotulo: "Rendimento (kg/ha)", num: true }], linhas: daUf.map((l) => [l.safra, fmtInteiro(l.pam_rendimento_kg_ha)]) },
      });
      grade.append(rendimento.no);
      graficoLinha(rendimento.area, { x: safras, series: [{ nome: "Rendimento", cor: cor("--serie-1"), dados: daUf.map((l) => l.pam_rendimento_kg_ha) }], formatar: (v) => fmtInteiro(v), formatarTooltip: (v) => `${fmtInteiro(v)} kg/ha` });
    }
  }
}

function campoDeVisao() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 400 400");
  svg.setAttribute("aria-hidden", "true");
  const add = (tag, attrs) => {
    const no = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) no.setAttribute(k, v);
    svg.append(no);
    return no;
  };
  const defs = add("defs", {});
  const luz = document.createElementNS(ns, "radialGradient");
  luz.id = "luz-campo";
  [["0%", "#1d2236"], ["70%", "#131726"], ["100%", "#0e1117"]].forEach(([o, c]) => {
    const parada = document.createElementNS(ns, "stop");
    parada.setAttribute("offset", o);
    parada.setAttribute("stop-color", c);
    luz.append(parada);
  });
  defs.append(luz);
  add("circle", { cx: 200, cy: 200, r: 196, fill: "url(#luz-campo)", stroke: "rgba(165,148,249,.35)", "stroke-width": 1.5 });
  let semente = 7;
  const sorteio = () => (semente = (semente * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 90; i += 1) {
    const angulo = sorteio() * Math.PI * 2;
    const raio = Math.sqrt(sorteio()) * 170;
    const x = (200 + Math.cos(angulo) * raio).toFixed(1);
    const y = (200 + Math.sin(angulo) * raio).toFixed(1);
    const r = 6 + sorteio() * 13;
    const infectada = sorteio() < 0.35;
    add("circle", { cx: x, cy: y, r: r.toFixed(1), fill: infectada ? "rgba(140,120,240,.22)" : "rgba(109,167,236,.05)", stroke: infectada ? "rgba(190,175,255,.4)" : "rgba(109,167,236,.22)", "stroke-width": 1 });
    if (infectada) add("circle", { cx: x, cy: y, r: (r * 0.28).toFixed(1), fill: "rgba(215,205,255,.45)" });
  }
  add("circle", { cx: 200, cy: 200, r: 196, fill: "none", stroke: "#0e1117", "stroke-width": 10 });
  return el("div", { classe: "campo" }, [svg, el("div", { classe: "escala" }, [el("i"), el("span", { texto: "11 lavouras" })])]);
}

function graficoMini(area, { anos, valores, corLinha, rotulo }) {
  const grafico = montarGrafico(area);
  const ultimo = valores.length - 1;
  grafico.setOption({
    ...baseGrafico(),
    grid: { left: 2, right: 6, top: 6, bottom: 2 },
    xAxis: { type: "category", data: anos, show: false, boundaryGap: false },
    yAxis: { type: "value", show: false, scale: true },
    tooltip: {
      ...baseGrafico().tooltip,
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: cor("--eixo") } },
      formatter: (itens) => `<div style="color:${cor("--texto-2")}">${escapar(rotulo)} · ${itens[0].axisValue}</div><b>${escapar(fmtInteiro(itens[0].value))} t</b>`,
    },
    series: [
      {
        type: "line",
        data: valores,
        showSymbol: false,
        lineStyle: { width: 2, color: corLinha },
        areaStyle: { color: corLinha, opacity: 0.08 },
        markPoint: {
          symbol: "circle",
          symbolSize: 8,
          itemStyle: { color: corLinha, borderColor: cor("--superficie"), borderWidth: 2 },
          label: { show: false },
          data: [{ coord: [ultimo, valores[ultimo]] }],
        },
      },
    ],
  });
}

async function renderVisao(raiz) {
  const [brasil, ufs, resumo] = await Promise.all([tabela("brasil_ano"), tabela("uf_ano"), tabela("resumo_ano")]);
  const produtos = paraObjetos(META.produtos);
  const nomeProduto = (p) => produtos.find((x) => x.produto === p)?.nome ?? p;
  const ano = Math.max(...brasil.map((l) => l.ano));
  const total = (a) => brasil.filter((l) => l.ano === a).reduce((s, l) => s + (l.valor_producao_brl_real ?? 0), 0);
  const totalAno = total(ano);
  const totalAntes = total(ano - 1);
  const linha = (p, a) => brasil.find((l) => l.produto === p && l.ano === a);
  const porProduto = brasil.filter((l) => l.ano === ano).sort((a, b) => b.valor_producao_brl_real - a.valor_producao_brl_real);
  const valorUf = new Map();
  for (const l of ufs.filter((x) => x.ano === ano)) valorUf.set(l.uf, (valorUf.get(l.uf) ?? 0) + (l.valor_producao_brl_real ?? 0));
  const ufsObj = paraObjetos(META.ufs);
  const porUf = [...valorUf.entries()]
    .map(([uf, valor]) => ({ uf, valor, participacao: valor / totalAno, codigo: String(ufsObj.find((u) => u.uf === uf).codigo_uf) }))
    .sort((a, b) => b.valor - a.valor);
  const municipios = resumo.find((r) => r.ano === ano)?.municipios_produtores;
  const lider = porProduto[0];
  const ufLider = porUf[0];
  const top3 = porUf.slice(0, 3).reduce((s, u) => s + u.participacao, 0);
  const soja = linha("soja", ano);
  const sojaAntes = linha("soja", ano - 1);
  const milho = linha("milho", ano);
  const milhoAntes = linha("milho", ano - 1);

  const paragrafo = el("p", {}, [
    document.createTextNode("As 11 lavouras da PAM somaram "),
    el("b", { texto: fmtReais(totalAno) }),
    document.createTextNode(` em valor da produção em ${ano}, em reais de ${mesBase()}. Cada número vem de fonte pública; como cada fonte foi conferida está em Método e fontes.`),
  ]);
  const ficha = el("div", { classe: "ficha" }, [
    el("span", {}, [document.createTextNode("coleta "), el("b", { texto: new Date(META.gerado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) })]),
    el("span", {}, [document.createTextNode("fontes "), el("b", { texto: "IBGE · CONAB · CEPEA · BCB · NASA" })]),
  ]);
  raiz.append(
    el("section", { classe: "heroi" }, [
      el("div", {}, [
        el("div", { classe: "especime", texto: "Lavouras do Brasil, observadas de perto" }),
        el("h1", { texto: `O que a PAM mostra em ${ano}` }),
        paragrafo,
        ficha,
      ]),
      campoDeVisao(),
    ]),
  );
  raiz.append(
    el("div", { classe: "kpis" }, [
      kpi(`valor das 11 lavouras em ${ano}`, fmtReais(totalAno), variacao(totalAno, totalAntes), `sobre ${ano - 1}, já corrigido`, "campo 01 · valor"),
      kpi(`soja colhida em ${ano}`, fmtToneladas(soja.producao_t), variacao(soja.producao_t, sojaAntes.producao_t), `sobre ${ano - 1}`, "campo 02 · Glycine max"),
      kpi(`milho colhido em ${ano}`, fmtToneladas(milho.producao_t), variacao(milho.producao_t, milhoAntes.producao_t), `sobre ${ano - 1}`, "campo 03 · Zea mays"),
      kpi("municípios com alguma das 11 lavouras", fmtInteiro(municipios), null, `em ${ano}, segundo a PAM`, "campo 04 · território"),
    ]),
  );
  const fonte = "Fonte: IBGE, PAM (tabela 5457); IPCA (IBGE) via SGS 433.";
  const grade = el("div", { classe: "grade-graficos" });
  raiz.append(grade);
  const barras = figura({
    titulo: "Valor da produção por lavoura",
    subtitulo: `Em ${ano}, reais de ${mesBase()}. A ${nomeProduto(lider.produto).toLowerCase()} respondeu por ${fmtPct(lider.valor_producao_brl_real / totalAno)}.`,
    fonte,
    tabelaDados: {
      colunas: [{ rotulo: "Lavoura" }, { rotulo: `Valor (R$ de ${mesBase()})`, num: true }, { rotulo: "Participação", num: true }],
      linhas: porProduto.map((l) => [nomeProduto(l.produto), fmtInteiro(l.valor_producao_brl_real), fmtPct(l.valor_producao_brl_real / totalAno)]),
    },
  });
  grade.append(barras.no);
  barras.area.style.height = "380px";
  graficoBarrasH(barras.area, {
    categorias: porProduto.map((l) => nomeProduto(l.produto)),
    valores: porProduto.map((l) => l.valor_producao_brl_real),
    corBarra: cor("--barra"),
    formatar: fmtReais,
    extraTooltip: (i) => `${fmtPct(porProduto[i].valor_producao_brl_real / totalAno)} do total`,
  });
  const nomeMapa = await registrarMapa("uf", "BR");
  const dadosMapa = porUf.map((u) => ({ codigo: u.codigo, valor: u.valor }));
  const cortes = quantis(dadosMapa.map((d) => d.valor), 5);
  const cores = coresSequenciais(cortes.length + 1);
  const mapa = figura({
    titulo: "Onde está o valor",
    subtitulo: `${nomeUf(ufLider.uf)} concentrou ${fmtPct(ufLider.participacao)}; as três maiores UFs, ${fmtPct(top3)}.`,
    fonte: "Fonte: IBGE, PAM (tabela 5457) e malha territorial.",
    legenda: legendaClasses(cortes, cores, fmtReais, "sem produção"),
    tabelaDados: {
      colunas: [{ rotulo: "UF" }, { rotulo: `Valor (R$ de ${mesBase()})`, num: true }, { rotulo: "Participação", num: true }],
      linhas: porUf.map((u) => [nomeUf(u.uf), fmtInteiro(u.valor), fmtPct(u.participacao)]),
    },
  });
  grade.append(mapa.no);
  mapa.area.style.height = "380px";
  graficoMapa(mapa.area, { nomeMapa, dados: dadosMapa, cortes, cores, formatar: fmtReais, nomes: new Map(ufsObj.map((u) => [String(u.codigo_uf), u.nome])), larguraBorda: 1 });

  raiz.append(el("div", { classe: "subtitulo-secao" }, [el("h2", { texto: "Onze anos de colheita" }), el("span", { texto: "toneladas · escala própria por lavoura" })]));
  const miniaturas = el("div", { classe: "miniaturas" });
  raiz.append(miniaturas);
  for (const p of porProduto) {
    const serie = brasil.filter((l) => l.produto === p.produto).sort((a, b) => a.ano - b.ano);
    const ultimo = serie[serie.length - 1];
    const anterior = serie[serie.length - 2];
    const v = variacao(ultimo.producao_t, anterior?.producao_t);
    const area = el("div", { classe: "miniatura-grafico" });
    miniaturas.append(
      el("div", { classe: "miniatura" }, [
        el("div", { classe: "miniatura-cabecalho" }, [el("span", { classe: "miniatura-nome", texto: nomeProduto(p.produto) }), el("span", { classe: "miniatura-valor", texto: fmtToneladas(ultimo.producao_t) })]),
        area,
        el("div", { classe: `miniatura-delta ${v >= 0 ? "sobe" : "desce"}`, texto: `${fmtPctSinal(v)} sobre ${anterior?.ano}` }),
      ]),
    );
    graficoMini(area, { anos: serie.map((l) => l.ano), valores: serie.map((l) => l.producao_t), corLinha: cor("--acento"), rotulo: nomeProduto(p.produto) });
  }
  const anosMini = [...new Set(brasil.map((l) => l.ano))].sort((a, b) => a - b);
  const tabelaMini = {
    colunas: [{ rotulo: "Lavoura" }, ...anosMini.map((a) => ({ rotulo: `${a} (t)`, num: true }))],
    linhas: porProduto.map((p) => [nomeProduto(p.produto), ...anosMini.map((a) => fmtInteiro(linha(p.produto, a)?.producao_t))]),
  };
  const csvMini = el("button", { type: "button", classe: "botao", texto: "CSV" });
  csvMini.addEventListener("click", () => baixarCsv("Produção anual das 11 lavouras", tabelaMini));
  raiz.append(
    el("div", { classe: "grafico-rodape" }, [el("figcaption", { texto: `${fonte} Produção em toneladas, Brasil.` }), el("div", { classe: "acoes-figura" }, [csvMini])]),
    tabelaHtml(tabelaMini),
  );

  const anos = [...new Set(brasil.map((l) => l.ano))].sort((a, b) => a - b);
  const valorTotal = figura({
    titulo: "Valor total das 11 lavouras",
    subtitulo: `Reais de ${mesBase()}, corrigidos pela média anual do IPCA`,
    fonte,
    largo: true,
    tabelaDados: { colunas: [{ rotulo: "Ano" }, { rotulo: `Valor (R$ de ${mesBase()})`, num: true }], linhas: anos.map((a) => [String(a), fmtInteiro(total(a))]) },
  });
  raiz.append(valorTotal.no);
  valorTotal.area.style.height = "260px";
  graficoLinha(valorTotal.area, { x: anos, series: [{ nome: "Valor real", cor: cor("--barra"), dados: anos.map(total) }], formatar: fmtReais, yMin: 0 });

  raiz.append(el("div", { classe: "subtitulo-secao" }, [el("h2", { texto: "Procedência" }), el("span", { texto: "cada fonte conferida contra a primária" })]));
  raiz.append(
    el(
      "ul",
      { classe: "fontes" },
      Object.entries(META.proveniencia).map(([nome, info]) =>
        el("li", {}, [
          el("span", { classe: "fonte-nome", texto: nome }),
          el("span", { classe: "fonte-detalhe", texto: `${META.periodos[nome] ?? ""} · ${fmtInteiro(info.arquivos)} ${info.arquivos === 1 ? "arquivo" : "arquivos"} · última coleta em ${fmtDia(info.ultima)}` }),
        ]),
      ),
    ),
  );
}

function renderMetodo(raiz) {
  const metodo = document.getElementById("metodo").content.cloneNode(true);
  for (const celula of metodo.querySelectorAll("[data-periodo]")) celula.textContent = META.periodos[celula.dataset.periodo] ?? "";
  metodo.querySelector("[data-conab-ultimo]").textContent = META.conab_ultimo;
  metodo.querySelector("[data-nasa-acesso]").textContent = META.proveniencia["NASA POWER"].ultima.slice(0, 10).replaceAll("-", "/");
  raiz.append(metodo);
}

const RENDER = {
  visao: renderVisao,
  producao: renderProducao,
  municipios: renderMunicipios,
  "pam-conab": renderPamConab,
  precos: renderPrecos,
  credito: renderCredito,
  clima: renderClima,
  metodo: renderMetodo,
};

async function periodos() {
  if (ESTADO.aba === "municipios") {
    const anos = [...new Set((await tabela("brasil_ano")).map((l) => l.ano))].sort((a, b) => b - a);
    return { nome: "Ano", opcoes: anos.map(String) };
  }
  if (ESTADO.aba === "pam-conab") {
    const linhas = (await tabela("uf_safra")).filter((l) => l.produto === ESTADO.produto);
    const safras = [...new Set(linhas.filter((l) => !nada(l.conab_producao_t)).map((l) => l.safra))].sort().reverse();
    return { nome: "Safra", opcoes: safras, padrao: safras.find((s) => pamBrasilSafra(linhas, s)) };
  }
  if (ESTADO.aba === "credito") {
    const linhas = (await tabela("credito_uf_safra")).filter((l) => l.produto === ESTADO.produto);
    return { nome: "Safra", opcoes: [...new Set(linhas.map((l) => l.safra))].sort().reverse() };
  }
  return null;
}

function preencherSelect(select, opcoes, valor) {
  select.replaceChildren(...opcoes.map(({ valor: v, rotulo }) => el("option", { value: v, texto: rotulo })));
  select.value = valor;
}

async function atualizarFiltros() {
  const filtros = document.getElementById("filtros");
  filtros.hidden = ESTADO.aba === "metodo" || ESTADO.aba === "visao";
  const periodo = await periodos();
  const rotulo = document.getElementById("rotulo-periodo");
  rotulo.hidden = !periodo || !periodo.opcoes.length;
  if (periodo && periodo.opcoes.length) {
    if (ESTADO.aba === "pam-conab" && !periodo.opcoes.includes(ESTADO.periodo)) {
      ESTADO.periodo = periodo.padrao ?? periodo.opcoes[0];
    } else if (!periodo.opcoes.includes(ESTADO.periodo)) {
      ESTADO.periodo = periodo.opcoes[0];
    }
    document.getElementById("nome-periodo").textContent = periodo.nome;
    preencherSelect(document.getElementById("filtro-periodo"), periodo.opcoes.map((o) => ({ valor: o, rotulo: o })), ESTADO.periodo);
  }
  document.getElementById("nota-filtro").textContent =
    ESTADO.aba === "precos" ? "O indicador é de uma praça; o filtro de local não se aplica." : "";
  document.getElementById("filtro-uf").disabled = ESTADO.aba === "precos";
}

function decodificar(parte) {
  try {
    return decodeURIComponent(parte);
  } catch {
    return "";
  }
}

function lerHash() {
  const [aba, produto, uf, periodo] = location.hash.slice(1).split("/").map(decodificar);
  if (ABAS.includes(aba)) ESTADO.aba = aba;
  if (produto && paraObjetos(META.produtos).some((p) => p.produto === produto)) ESTADO.produto = produto;
  if (uf && (uf === "BR" || paraObjetos(META.ufs).some((u) => u.uf === uf))) ESTADO.uf = uf;
  ESTADO.periodo = periodo || null;
}

function escreverHash() {
  const partes = [ESTADO.aba, ESTADO.produto, ESTADO.uf];
  if (ESTADO.periodo) partes.push(ESTADO.periodo);
  history.replaceState(null, "", `#${partes.map(encodeURIComponent).join("/")}`);
}

async function render() {
  CONTADOR.figura = 0;
  CONTADOR.kpi = 0;
  for (const grafico of GRAFICOS.splice(0)) grafico.dispose();
  document.querySelectorAll(".abas a").forEach((a) => {
    if (a.dataset.aba === ESTADO.aba) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  await atualizarFiltros();
  document.getElementById("filtro-produto").value = ESTADO.produto;
  document.getElementById("filtro-uf").value = ESTADO.uf;
  escreverHash();
  const conteudo = document.getElementById("conteudo");
  const novo = document.createElement("div");
  conteudo.style.opacity = "0.6";
  try {
    conteudo.replaceChildren(novo);
    await RENDER[ESTADO.aba](novo);
    requestAnimationFrame(redimensionar);
  } catch (erro) {
    conteudo.replaceChildren(vazio(`Não foi possível montar esta seção: ${erro.message}`));
  } finally {
    conteudo.style.opacity = "";
  }
}

async function iniciar() {
  META = await carregar("meta");
  const produtos = paraObjetos(META.produtos).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  preencherSelect(document.getElementById("filtro-produto"), produtos.map((p) => ({ valor: p.produto, rotulo: p.nome })), ESTADO.produto);
  const ufs = paraObjetos(META.ufs).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  preencherSelect(document.getElementById("filtro-uf"), [{ valor: "BR", rotulo: "Brasil" }, ...ufs.map((u) => ({ valor: u.uf, rotulo: u.nome }))], ESTADO.uf);
  const dataDados = new Date(META.gerado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  document.getElementById("data-dados").textContent = `Dados de ${dataDados} · valores reais em R$ de ${mesBase()}`;
  document.getElementById("botao-link").addEventListener("click", async () => {
    const aviso = document.getElementById("aviso-copia");
    try {
      await navigator.clipboard.writeText(location.href);
      aviso.textContent = "link copiado";
    } catch {
      aviso.textContent = location.href;
    }
    setTimeout(() => {
      aviso.textContent = "";
    }, 2500);
  });
  document.getElementById("filtro-produto").addEventListener("change", (e) => {
    ESTADO.produto = e.target.value;
    render();
  });
  document.getElementById("filtro-uf").addEventListener("change", (e) => {
    ESTADO.uf = e.target.value;
    render();
  });
  document.getElementById("filtro-periodo").addEventListener("change", (e) => {
    ESTADO.periodo = e.target.value;
    render();
  });
  document.querySelectorAll(".abas a").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      ESTADO.aba = a.dataset.aba;
      ESTADO.periodo = null;
      render();
    }),
  );
  window.addEventListener("hashchange", () => {
    lerHash();
    render();
  });
  let espera = null;
  window.addEventListener("resize", () => {
    clearTimeout(espera);
    espera = setTimeout(redimensionar, 150);
  });
  lerHash();
  await document.fonts.ready;
  await render();
}

document.addEventListener("DOMContentLoaded", () => {
  iniciar().catch((erro) => {
    document.getElementById("conteudo").replaceChildren(vazio(`Não foi possível carregar os dados: ${erro.message}`));
  });
});
