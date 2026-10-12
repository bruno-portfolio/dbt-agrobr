from __future__ import annotations

import argparse
import gzip
import json
import math
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import duckdb

RAIZ = Path(__file__).resolve().parent
MALHA_IBGE = (
    "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR"
    "?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao={nivel}"
)
CASAS_COORDENADA = 3
GZIP_MAGIC = bytes([0x1F, 0x8B])
MESES = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
]
FONTES_DO_MANIFESTO = {
    "producao_anual": "IBGE – PAM",
    "estimativa_safra": "CONAB – Acompanhamento de Safra",
    "estimativa_levantamento": "CONAB – Acompanhamento de Safra",
    "preco_diario": "CEPEA/ESALQ",
    "credito_rural": "BCB – SICOR",
    "bcb_sgs": "BCB – SGS (IPCA)",
    "clima_celula": "NASA POWER",
}


def _valor(v: Any) -> Any:
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    if isinstance(v, float):
        return round(v, 6)
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def colunar(con: duckdb.DuckDBPyConnection, sql: str) -> dict[str, Any]:
    resultado = con.sql(sql)
    return {
        "colunas": resultado.columns,
        "linhas": [[_valor(v) for v in linha] for linha in resultado.fetchall()],
    }


def gravar(destino: Path, nome: str, conteudo: Any) -> None:
    arquivo = destino / f"{nome}.json"
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    arquivo.write_text(
        json.dumps(conteudo, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def _arredondar(coordenadas: Any) -> Any:
    if isinstance(coordenadas[0], (int, float)):
        return [round(c, CASAS_COORDENADA) for c in coordenadas]
    return [_arredondar(c) for c in coordenadas]


def malha(nivel: str, destino: Path) -> None:
    """Baixa a malha do IBGE (qualidade mínima) e grava com coordenadas em 3 casas decimais (~100 m)."""
    with urllib.request.urlopen(
        MALHA_IBGE.format(nivel=nivel), timeout=300
    ) as resposta:
        bruto = resposta.read()
    if bruto[:2] == GZIP_MAGIC:
        bruto = gzip.decompress(bruto)
    geo = json.loads(bruto.decode("utf-8"))
    for feicao in geo["features"]:
        feicao["geometry"]["coordinates"] = _arredondar(
            feicao["geometry"]["coordinates"]
        )
    gravar(destino, f"geo/{nivel.lower()}", geo)


def proveniencia(manifesto: Path) -> dict[str, Any]:
    """Resume, por fonte, os arquivos de dados presentes e o último registro de cada um no manifesto."""
    vigentes: dict[str, dict[str, Any]] = {}
    for linha in manifesto.open(encoding="utf-8"):
        registro = json.loads(linha)
        if registro["tabela"] in FONTES_DO_MANIFESTO:
            vigentes[registro["arquivo"]] = registro
    por_fonte: dict[str, dict[str, Any]] = {}
    for arquivo, registro in vigentes.items():
        if not (manifesto.parent / arquivo).exists():
            continue
        meta = registro["meta"]
        atual = por_fonte.setdefault(
            FONTES_DO_MANIFESTO[registro["tabela"]],
            {"arquivos": 0, "primeira": None, "ultima": None, "agrobr": set()},
        )
        atual["arquivos"] += 1
        momento = meta.get("fetched_at") or registro["inicio"]
        atual["primeira"] = min(filter(None, [atual["primeira"], momento]))
        atual["ultima"] = max(filter(None, [atual["ultima"], momento]))
        atual["agrobr"].add(meta.get("agrobr_version", ""))
    return {
        fonte: {**dados, "agrobr": sorted(v for v in dados["agrobr"] if v)}
        for fonte, dados in por_fonte.items()
    }


def _mes(dia: Any) -> str:
    return f"{MESES[dia.month - 1]}/{dia.year}"


def periodos(con: duckdb.DuckDBPyConnection) -> dict[str, str]:
    def extremos(sql: str) -> tuple[Any, Any]:
        return con.sql(sql).fetchone()

    pam = extremos("select min(ano), max(ano) from fct_brasil_ano")
    conab = extremos(
        "select min(safra), max(safra) from fct_uf_safra where conab_producao_t is not null"
    )
    preco = extremos("select min(data), max(data) from stg_agrobr__preco_diario")
    sicor = extremos("select min(safra), max(safra) from fct_credito_uf_safra")
    ipca = extremos("select min(mes), max(mes) from int_ipca__indice_mensal")
    clima = extremos("select min(mes), max(mes) from stg_agrobr__clima_celula")
    return {
        "IBGE – PAM": f"{pam[0]} a {pam[1]}",
        "CONAB – Acompanhamento de Safra": f"safras {conab[0]} a {conab[1]}",
        "CEPEA/ESALQ": f"{_mes(preco[0])} a {_mes(preco[1])}",
        "BCB – SICOR": f"safras {sicor[0]} a {sicor[1]}",
        "BCB – SGS (IPCA)": f"{_mes(ipca[0])} a {_mes(ipca[1])}",
        "NASA POWER": f"{_mes(clima[0])} a {_mes(clima[1])}",
    }


def conab_ultimo(con: duckdb.DuckDBPyConnection) -> str:
    levantamento, safra, publicacao = con.sql(
        "select levantamento, safra, data_publicacao from fct_estimativa_levantamento"
        " order by data_publicacao desc, safra desc limit 1"
    ).fetchone()
    return f"{levantamento}º levantamento da safra {safra}, de {publicacao:%d/%m/%Y}"


def exportar(banco: Path, manifesto: Path, destino: Path, com_malhas: bool) -> None:
    con = duckdb.connect(str(banco), read_only=True)
    mes_base = con.sql("select max(mes_base) from int_ipca__indice_mensal").fetchone()[
        0
    ]
    gravar(
        destino,
        "meta",
        {
            "gerado_em": datetime.now(UTC).isoformat(timespec="seconds"),
            "mes_base_real": mes_base.isoformat(),
            "proveniencia": proveniencia(manifesto),
            "periodos": periodos(con),
            "conab_ultimo": conab_ultimo(con),
            "produtos": colunar(con, "select * from dim_produto order by produto"),
            "ufs": colunar(
                con, "select uf, codigo_uf, nome, regiao from uf order by uf"
            ),
            "indicadores": colunar(
                con, "select * from indicadores_cepea order by produto"
            ),
        },
    )
    gravar(
        destino,
        "brasil_ano",
        colunar(
            con, "select * exclude (licencas) from fct_brasil_ano order by produto, ano"
        ),
    )
    gravar(
        destino,
        "uf_ano",
        colunar(
            con, "select * exclude (licencas) from fct_uf_ano order by produto, uf, ano"
        ),
    )
    gravar(
        destino,
        "uf_safra",
        colunar(
            con,
            "select * exclude (licencas) from fct_uf_safra order by produto, uf, safra",
        ),
    )
    gravar(
        destino,
        "estimativa_levantamento",
        colunar(
            con,
            "select produto, safra, uf, levantamento, data_publicacao, producao_t"
            " from fct_estimativa_levantamento order by produto, safra, levantamento, uf",
        ),
    )
    gravar(
        destino,
        "preco_mes",
        colunar(
            con, "select * exclude (licencas) from fct_preco_mes order by produto, mes"
        ),
    )
    gravar(
        destino,
        "credito_uf_safra",
        colunar(
            con,
            "select * exclude (licencas) from fct_credito_uf_safra order by produto, uf, safra",
        ),
    )
    for (produto,) in con.sql(
        "select distinct produto from fct_municipio_ano order by 1"
    ).fetchall():
        gravar(
            destino,
            f"municipio_ano/{produto}",
            colunar(
                con,
                f"""
                select cod_municipio, ano, area_plantada_ha, producao_t, rendimento_kg_ha,
                       valor_producao_brl_real, participacao_producao_uf
                from fct_municipio_ano
                where produto = '{produto}' and (producao_t > 0 or producao_t is null)
                order by ano, cod_municipio
                """,
            ),
        )
    gravar(
        destino,
        "municipios",
        colunar(
            con,
            "select cod_municipio, nome, uf from dim_municipio order by cod_municipio",
        ),
    )
    gravar(
        destino,
        "resumo_ano",
        colunar(
            con,
            """
            select ano,
                   count(distinct cod_municipio) filter (where producao_t > 0) as municipios_produtores
            from fct_municipio_ano
            group by ano
            order by ano
            """,
        ),
    )
    if com_malhas:
        malha("UF", destino)
        malha("municipio", destino)


if __name__ == "__main__":
    argumentos = argparse.ArgumentParser(
        description="Exporta os marts do dbt-agrobr para o painel estático."
    )
    argumentos.add_argument("--banco", type=Path, default=RAIZ.parent / "agrobr.duckdb")
    argumentos.add_argument(
        "--manifesto", type=Path, default=RAIZ.parent / "dados" / "_manifesto.jsonl"
    )
    argumentos.add_argument("--destino", type=Path, default=RAIZ / "dados")
    argumentos.add_argument(
        "--sem-malhas", action="store_true", help="não baixa de novo as malhas do IBGE"
    )
    lidos = argumentos.parse_args()
    exportar(lidos.banco, lidos.manifesto, lidos.destino, not lidos.sem_malhas)
