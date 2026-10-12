from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
import traceback
from collections.abc import Awaitable, Callable, Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import duckdb
import pandas as pd

from agrobr import contracts, datasets, ibge, nasa_power

PAUSA_ENTRE_CHAMADAS_S = 2
PRIMEIRO_ANO = 2015
PRIMEIRA_SAFRA_COM_LEVANTAMENTOS = 2022
SAFRAS_CONAB_RENOVADAS = 3
LEVANTAMENTOS_POR_SAFRA = 12
MES_ANTERIOR_AO_PRIMEIRO_LEVANTAMENTO = 9
PRIMEIRO_LEVANTAMENTO_DO_PRODUTO = {"trigo": 5}
LEVANTAMENTOS_QUE_O_AGROBR_NAO_LE = {("arroz", 2023, 5)}
NIVEIS_PAM = ["brasil", "uf", "municipio"]
VARIAVEIS_PAM = [
    "area_plantada",
    "area_colhida",
    "producao",
    "rendimento",
    "valor_producao",
]
PRODUTOS_PAM = [
    "soja",
    "milho",
    "arroz",
    "feijao",
    "trigo",
    "algodao",
    "cafe",
    "cacau",
    "cana",
    "mandioca",
    "laranja",
]
PRODUTOS_CONAB = ["soja", "milho", "arroz", "feijao", "trigo", "algodao"]
PRODUTOS_CEPEA = ["soja", "milho", "cafe", "cafe_robusta", "trigo", "algodao"]
PRODUTOS_SICOR = [
    "soja",
    "milho",
    "arroz",
    "feijao",
    "trigo",
    "algodao",
    "cafe",
    "cana",
    "mandioca",
    "sorgo",
]
INICIO_PRECO = "2015-07-01"
INICIO_IPCA = "2014-01-01"
CODIGO_IPCA = 433
INICIO_CLIMA = "2014-07-01"
MES_FINAL_CLIMA = 6
GRADE_LAT_GRAUS = 0.5
GRADE_LON_GRAUS = 0.625
CHAMADAS_SIMULTANEAS_CLIMA = 3
SAIDA_PENDENTE = 75
CONTRATO_DA_TABELA: dict[str, str | None] = {
    "estimativa_levantamento": "estimativa_safra",
    "clima_celula": None,
}
MUNICIPIOS = Path(__file__).resolve().parents[1] / "seeds" / "municipios_ibge.csv"

TIPOS_DUCKDB = {
    contracts.ColumnType.DATE: "date",
    contracts.ColumnType.DATETIME: "timestamp",
    contracts.ColumnType.STRING: "varchar",
    contracts.ColumnType.INTEGER: "bigint",
    contracts.ColumnType.FLOAT: "double",
    contracts.ColumnType.DECIMAL: "double",
    contracts.ColumnType.BOOLEAN: "boolean",
}


@dataclass(frozen=True)
class Carga:
    """Uma chamada ao agrobr gravada em `<tabela>/<nome>.parquet`.

    `renovar` busca de novo mesmo com Parquet e registro no manifesto: vale para o que a fonte ainda muda
    (preços, IPCA, safras recentes da CONAB, a safra fechada mais recente do SICOR, clima que não cobre o período).
    """

    tabela: str
    nome: str
    chamada: Callable[[], Awaitable[Any]]
    renovar: bool = False


def rotulo_safra(ano_inicial: int) -> str:
    return f"{ano_inicial}/{(ano_inicial + 1) % 100:02d}"


def safra_corrente(hoje: date) -> int:
    """Ano inicial da safra de julho a junho que contém `hoje`."""
    return hoje.year if hoje.month >= 7 else hoje.year - 1


def anos_pam(hoje: date) -> list[int]:
    return list(range(PRIMEIRO_ANO, hoje.year))


def levantamentos_esperados(ano_inicial: int, hoje: date) -> int:
    """Quantos levantamentos da safra a CONAB pode ter publicado até `hoje`: o 1º em outubro, o 12º em setembro."""
    meses = (
        (hoje.year - ano_inicial) * 12
        + hoje.month
        - MES_ANTERIOR_AO_PRIMEIRO_LEVANTAMENTO
    )
    return max(0, min(LEVANTAMENTOS_POR_SAFRA, meses))


def gravar(df: pd.DataFrame, tabela: str, nome: str, destino: Path) -> Path:
    """Grava `destino/<tabela>/<nome>.parquet` com cada coluna do contrato da tabela no tipo do contrato.

    Coluna do contrato ausente no DataFrame sai nula; coluna fora do contrato vai ao fim, sem conversão.
    Tabela sem contrato é gravada como veio. O arquivo só substitui o anterior depois de escrito por inteiro.
    """
    arquivo = destino / tabela / f"{nome}.parquet"
    provisorio = arquivo.with_suffix(".tmp")
    arquivo.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.register("df", df)
    con.execute(
        f"copy (select {_colunas(df, tabela)} from df) to '{provisorio.as_posix()}' (format parquet)"
    )
    con.close()
    os.replace(provisorio, arquivo)
    return arquivo


def _colunas(df: pd.DataFrame, tabela: str) -> str:
    nome_contrato = CONTRATO_DA_TABELA.get(tabela, tabela)
    if nome_contrato is None:
        return "*"
    contrato = contracts.get_contract(nome_contrato)
    colunas = [
        f'cast("{c.name}" as {TIPOS_DUCKDB[c.type]}) as "{c.name}"'
        if c.name in df.columns
        else f'cast(null as {TIPOS_DUCKDB[c.type]}) as "{c.name}"'
        for c in contrato.columns
    ]
    nomes = {c.name for c in contrato.columns}
    colunas += [f'"{coluna}"' for coluna in df.columns if coluna not in nomes]
    return ", ".join(colunas)


def _pam(hoje: date, destino: Path) -> Iterator[Carga]:
    for produto in PRODUTOS_PAM:
        for nivel in NIVEIS_PAM:
            for ano in anos_pam(hoje):
                yield Carga(
                    "producao_anual",
                    f"pam_{nivel}_{produto}_{ano}",
                    lambda p=produto, n=nivel, a=ano: ibge.pam(
                        p, ano=a, nivel=n, variaveis=VARIAVEIS_PAM, return_meta=True
                    ),
                )


def _conab(hoje: date, destino: Path) -> Iterator[Carga]:
    corrente = safra_corrente(hoje)
    for produto in PRODUTOS_CONAB:
        for ano in range(PRIMEIRO_ANO, corrente + 1):
            yield Carga(
                "estimativa_safra",
                f"conab_{produto}_{rotulo_safra(ano).replace('/', '_')}",
                lambda p=produto, s=rotulo_safra(ano): datasets.estimativa_safra(
                    p, safra=s, fonte="conab", return_meta=True
                ),
                renovar=ano > corrente - SAFRAS_CONAB_RENOVADAS,
            )
        for ano in range(PRIMEIRA_SAFRA_COM_LEVANTAMENTOS, corrente + 1):
            for levantamento in range(
                PRIMEIRO_LEVANTAMENTO_DO_PRODUTO.get(produto, 1),
                levantamentos_esperados(ano, hoje) + 1,
            ):
                if (produto, ano, levantamento) in LEVANTAMENTOS_QUE_O_AGROBR_NAO_LE:
                    continue
                yield Carga(
                    "estimativa_levantamento",
                    f"conab_{produto}_{rotulo_safra(ano).replace('/', '_')}_lev{levantamento:02d}",
                    lambda p=produto, s=rotulo_safra(ano), n=levantamento: (
                        datasets.estimativa_safra(
                            p, safra=s, fonte="conab", levantamento=n, return_meta=True
                        )
                    ),
                )


def _cepea(hoje: date, destino: Path) -> Iterator[Carga]:
    for produto in PRODUTOS_CEPEA:
        yield Carga(
            "preco_diario",
            f"cepea_{produto}",
            lambda p=produto: datasets.preco_diario(
                p, inicio=INICIO_PRECO, fim=hoje.isoformat(), return_meta=True
            ),
            renovar=True,
        )


def _sicor(hoje: date, destino: Path) -> Iterator[Carga]:
    ultima_fechada = safra_corrente(hoje) - 1
    for produto in PRODUTOS_SICOR:
        for ano in range(PRIMEIRO_ANO, ultima_fechada + 1):
            yield Carga(
                "credito_rural",
                f"sicor_{produto}_{rotulo_safra(ano).replace('/', '_')}",
                lambda p=produto, s=rotulo_safra(ano): datasets.credito_rural(
                    p, safra=s, return_meta=True
                ),
                renovar=ano == ultima_fechada,
            )


def _ipca(hoje: date, destino: Path) -> Iterator[Carga]:
    yield Carga(
        "bcb_sgs",
        f"sgs_{CODIGO_IPCA}",
        lambda: datasets.series_economicas(
            CODIGO_IPCA, inicio=INICIO_IPCA, fim=hoje.isoformat(), return_meta=True
        ),
        renovar=True,
    )


def celulas_merra2() -> list[tuple[float, float]]:
    """Centros das células da grade MERRA-2 (0,5° × 0,625°) que contêm as coordenadas dos municípios.

    O NASA POWER devolve o mesmo valor meteorológico para qualquer ponto dentro da célula.
    """
    return [
        (lat, lon)
        for lat, lon in duckdb.sql(
            f"select distinct round(lat / {GRADE_LAT_GRAUS}) * {GRADE_LAT_GRAUS},"
            f" round(lon / {GRADE_LON_GRAUS}) * {GRADE_LON_GRAUS}"
            f" from '{MUNICIPIOS.as_posix()}' order by 1, 2"
        ).fetchall()
    ]


def ano_final_clima(hoje: date, destino: Path) -> int:
    """Último ano da PAM municipal carregada: o clima de cada safra é ponderado pela área plantada desse ano."""
    arquivos = list((destino / "producao_anual").glob("pam_municipio_*.parquet"))
    if not arquivos:
        return anos_pam(hoje)[-1]
    return max(int(arquivo.stem.rsplit("_", 1)[1]) for arquivo in arquivos)


def cobertura_clima(destino: Path) -> dict[str, date]:
    pasta = destino / "clima_celula"
    if not any(pasta.glob("*.parquet")):
        return {}
    return {
        Path(arquivo).stem: mes.date()
        for arquivo, mes in duckdb.sql(
            f"select filename, max(mes) from read_parquet('{pasta.as_posix()}/*.parquet',"
            " filename = true) group by filename"
        ).fetchall()
    }


async def _celula(lat: float, lon: float, fim: str) -> Any:
    df, meta = await nasa_power.clima_ponto(
        lat, lon, INICIO_CLIMA, fim, agregacao="mensal", return_meta=True
    )
    return df.assign(celula_lat=lat, celula_lon=lon), meta


def _clima(hoje: date, destino: Path) -> Iterator[Carga]:
    ano = ano_final_clima(hoje, destino)
    ultimo_mes = date(ano, MES_FINAL_CLIMA, 1)
    cobertura = cobertura_clima(destino)
    for lat, lon in celulas_merra2():
        nome = f"celula_{lat:+.3f}_{lon:+.3f}"
        yield Carga(
            "clima_celula",
            nome,
            lambda a=lat, o=lon: _celula(a, o, f"{ano}-{MES_FINAL_CLIMA:02d}-30"),
            renovar=cobertura.get(nome, date.min) < ultimo_mes,
        )


GRUPOS: dict[str, Callable[[date, Path], Iterator[Carga]]] = {
    "pam": _pam,
    "conab": _conab,
    "cepea": _cepea,
    "sicor": _sicor,
    "ipca": _ipca,
    "clima": _clima,
}
SIMULTANEAS = {"clima": CHAMADAS_SIMULTANEAS_CLIMA}


def _registrar(arquivo: Path, registro: dict[str, Any]) -> None:
    with arquivo.open("a", encoding="utf-8") as saida:
        saida.write(json.dumps(registro, ensure_ascii=False, default=str) + "\n")


def _registrados(manifesto: Path) -> set[tuple[str, str]]:
    if not manifesto.exists():
        return set()
    with manifesto.open(encoding="utf-8") as linhas:
        return {(r["tabela"], r["nome"]) for r in map(json.loads, linhas)}


async def _executar(carga: Carga, destino: Path) -> bool:
    """Busca e grava a carga; resultado vazio (dado ainda não publicado) não grava nada nem apaga o anterior."""
    inicio = datetime.now(UTC)
    try:
        df, meta = await carga.chamada()
        if df.empty:
            print(carga.nome, "sem dados publicados", flush=True)
            return True
        arquivo = gravar(df, carga.tabela, carga.nome, destino)
        _registrar(
            destino / "_manifesto.jsonl",
            {
                "nome": carga.nome,
                "tabela": carga.tabela,
                "linhas": len(df),
                "arquivo": arquivo.relative_to(destino).as_posix(),
                "inicio": inicio,
                "meta": meta.to_dict(),
            },
        )
        print(carga.nome, len(df), flush=True)
        return True
    except Exception as erro:
        _registrar(
            destino / "_erros.jsonl",
            {
                "nome": carga.nome,
                "tabela": carga.tabela,
                "inicio": inicio,
                "erro": f"{type(erro).__name__}: {erro}",
                "traceback": traceback.format_exc(limit=5),
            },
        )
        print(carga.nome, "ERRO", type(erro).__name__, str(erro)[:200], flush=True)
        return False


async def carregar(
    grupo: str, destino: Path, hoje: date, prazo: float = float("inf")
) -> tuple[int, int]:
    """Grava cada carga do grupo em `destino/<tabela>/<nome>.parquet` e devolve (falhas, pendentes).

    Pula a carga que já tem Parquet e registro no manifesto, salvo as marcadas para renovar. Depois de `prazo`
    (`time.monotonic()`), não começa carga nova: as que sobram contam como pendentes e ficam para a próxima
    execução. Proveniência de cada carga vai para `destino/_manifesto.jsonl`; falha vai para
    `destino/_erros.jsonl` sem interromper as demais.
    """
    destino.mkdir(parents=True, exist_ok=True)
    registrados = _registrados(destino / "_manifesto.jsonl")
    vagas = asyncio.Semaphore(SIMULTANEAS.get(grupo, 1))
    a_fazer = [
        carga
        for carga in GRUPOS[grupo](hoje, destino)
        if carga.renovar
        or (carga.tabela, carga.nome) not in registrados
        or not (destino / carga.tabela / f"{carga.nome}.parquet").exists()
    ]

    async def _uma(carga: Carga) -> bool | None:
        async with vagas:
            if time.monotonic() > prazo:
                return None
            feito = await _executar(carga, destino)
            await asyncio.sleep(PAUSA_ENTRE_CHAMADAS_S)
            return feito

    resultados = await asyncio.gather(*(_uma(carga) for carga in a_fazer))
    return resultados.count(False), resultados.count(None)


if __name__ == "__main__":
    argumentos = argparse.ArgumentParser(
        description="Carga real do dbt-agrobr a partir do agrobr 2.0."
    )
    argumentos.add_argument("grupo", choices=sorted(GRUPOS))
    argumentos.add_argument(
        "--destino", type=Path, default=Path(__file__).resolve().parents[1] / "dados"
    )
    argumentos.add_argument(
        "--hoje", type=date.fromisoformat, default=date.today(), help="AAAA-MM-DD"
    )
    argumentos.add_argument(
        "--limite-minutos",
        type=float,
        help="não começa carga nova depois desse tempo; sai com 75 se sobrar carga",
    )
    lidos = argumentos.parse_args()
    prazo = (
        time.monotonic() + 60 * lidos.limite_minutos
        if lidos.limite_minutos
        else float("inf")
    )
    falhas, pendentes = asyncio.run(
        carregar(lidos.grupo, lidos.destino, lidos.hoje, prazo)
    )
    print(f"{lidos.grupo}: {falhas} falhas, {pendentes} pendentes", flush=True)
    sys.exit(SAIDA_PENDENTE if pendentes else 1 if falhas else 0)
