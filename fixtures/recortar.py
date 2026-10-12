from __future__ import annotations

import argparse
from pathlib import Path

import duckdb

RAIZ = Path(__file__).resolve().parents[1]
RECORTES = {
    "producao_anual": "select * from {origem} where produto = 'soja' and ano = 2024",
    "estimativa_safra": "select * from {origem} where produto = 'soja' and safra = '2023/24'",
    "estimativa_levantamento": (
        "select * from {origem} where produto = 'soja' and safra = '2023/24'"
    ),
    "preco_diario": (
        "select * from {origem} where produto = 'soja' and data between '2023-07-01' and '2024-06-30'"
    ),
    "credito_rural": "select * from {origem} where produto = 'soja' and safra = '2023/24'",
    "bcb_sgs": "select * from {origem} where data between '2023-01-01' and '2024-12-31'",
    "clima_celula": (
        "select * from {origem} where celula_lat = -16.0 and celula_lon = -47.5"
        " and mes between '2023-07-01' and '2024-06-01'"
    ),
}


def recortar(origem: Path, destino: Path) -> None:
    """Grava em `destino` o recorte de soja 2023/24 dos dados completos, mantendo os tipos do Parquet.

    O recorte tem todos os níveis da PAM de 2024 (municípios, UFs e Brasil), para que os testes de
    soma passem, os 12 levantamentos da CONAB da safra e a célula de clima que contém Brasília, única
    cidade do DF.
    """
    con = duckdb.connect()
    for tabela, consulta in RECORTES.items():
        arquivo = destino / tabela / "recorte.parquet"
        arquivo.parent.mkdir(parents=True, exist_ok=True)
        fonte = f"read_parquet('{(origem / tabela).as_posix()}/*.parquet', union_by_name = true)"
        con.execute(
            f"copy ({consulta.format(origem=fonte)}) to '{arquivo.as_posix()}' (format parquet)"
        )
        linhas = con.sql(f"select count(*) from '{arquivo.as_posix()}'").fetchone()[0]
        print(tabela, linhas)


if __name__ == "__main__":
    argumentos = argparse.ArgumentParser(
        description="Recorta a fixture do CI a partir da carga completa."
    )
    argumentos.add_argument("--origem", type=Path, default=RAIZ / "dados")
    argumentos.add_argument("--destino", type=Path, default=RAIZ / "fixtures" / "dados")
    lidos = argumentos.parse_args()
    recortar(lidos.origem, lidos.destino)
