import asyncio
import json
from datetime import date
from types import SimpleNamespace

import carregar
import duckdb
import pandas as pd
import pytest

HOJE = date(2026, 10, 11)


@pytest.fixture(autouse=True)
def sem_pausa(monkeypatch):
    monkeypatch.setattr(carregar, "PAUSA_ENTRE_CHAMADAS_S", 0)


def _parquet(caminho, sql):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    duckdb.sql(f"copy ({sql}) to '{caminho.as_posix()}' (format parquet)")


def _grupo(monkeypatch, *cargas):
    monkeypatch.setitem(carregar.GRUPOS, "teste", lambda hoje, destino: iter(cargas))


def _chamada(df, chamadas):
    async def chamada():
        chamadas.append(1)
        return df, SimpleNamespace(to_dict=lambda: {"fonte": "teste"})

    return chamada


def test_rotulo_safra():
    assert carregar.rotulo_safra(2025) == "2025/26"
    assert carregar.rotulo_safra(2099) == "2099/00"


def test_safra_corrente_vira_em_julho():
    assert carregar.safra_corrente(date(2026, 6, 30)) == 2025
    assert carregar.safra_corrente(date(2026, 7, 1)) == 2026


def test_anos_pam_vao_ate_o_ano_anterior():
    assert carregar.anos_pam(HOJE) == list(range(2015, 2026))


def test_levantamentos_esperados():
    assert carregar.levantamentos_esperados(2026, date(2026, 9, 30)) == 0
    assert carregar.levantamentos_esperados(2026, date(2026, 10, 1)) == 1
    assert carregar.levantamentos_esperados(2025, date(2026, 9, 15)) == 12
    assert carregar.levantamentos_esperados(2022, HOJE) == 12


def test_conab_renova_so_as_safras_recentes(tmp_path):
    cargas = [c for c in carregar._conab(HOJE, tmp_path) if "_soja_" in c.nome]
    vigentes = {c.nome: c.renovar for c in cargas if c.tabela == "estimativa_safra"}
    assert [n for n, renovar in vigentes.items() if renovar] == [
        "conab_soja_2024_25",
        "conab_soja_2025_26",
        "conab_soja_2026_27",
    ]
    levantamentos = [c.nome for c in cargas if c.tabela == "estimativa_levantamento"]
    assert len(levantamentos) == 4 * 12 + 1
    assert levantamentos[-1] == "conab_soja_2026_27_lev01"
    assert not any(c.renovar for c in cargas if c.tabela == "estimativa_levantamento")


def test_conab_pula_levantamentos_sem_o_produto_ou_ilegiveis(tmp_path):
    nomes = [
        c.nome
        for c in carregar._conab(HOJE, tmp_path)
        if c.tabela == "estimativa_levantamento"
    ]
    assert "conab_trigo_2025_26_lev04" not in nomes
    assert "conab_trigo_2025_26_lev05" in nomes
    assert "conab_arroz_2023_24_lev05" not in nomes
    assert "conab_arroz_2023_24_lev06" in nomes


def test_sicor_renova_a_safra_fechada_mais_recente(tmp_path):
    cargas = [c for c in carregar._sicor(HOJE, tmp_path) if "_soja_" in c.nome]
    assert cargas[-1].nome == "sicor_soja_2025_26"
    assert [c.nome for c in cargas if c.renovar] == ["sicor_soja_2025_26"]


def test_pam_tem_um_arquivo_por_nivel_produto_e_ano(tmp_path):
    nomes = [c.nome for c in carregar._pam(HOJE, tmp_path)]
    assert len(nomes) == len(set(nomes)) == 3 * 11 * 11
    assert "pam_uf_soja_2025" in nomes
    assert not any(c.renovar for c in carregar._pam(HOJE, tmp_path))


def test_clima_renova_a_celula_que_nao_cobre_o_ultimo_ano_da_pam(tmp_path):
    _parquet(
        tmp_path / "producao_anual" / "pam_municipio_soja_2025.parquet",
        "select 2025 as ano",
    )
    primeira, segunda = carregar.celulas_merra2()[:2]
    nomes = [f"celula_{lat:+.3f}_{lon:+.3f}" for lat, lon in (primeira, segunda)]
    _parquet(
        tmp_path / "clima_celula" / f"{nomes[0]}.parquet",
        "select timestamp '2025-06-01' as mes",
    )
    _parquet(
        tmp_path / "clima_celula" / f"{nomes[1]}.parquet",
        "select timestamp '2025-05-01' as mes",
    )
    renovar = {c.nome: c.renovar for c in carregar._clima(HOJE, tmp_path)}
    assert renovar[nomes[0]] is False
    assert renovar[nomes[1]] is True
    assert sum(renovar.values()) == len(renovar) - 1


def test_carregar_nao_grava_resultado_vazio(tmp_path, monkeypatch):
    chamadas = []
    _grupo(
        monkeypatch,
        carregar.Carga("clima_celula", "vazia", _chamada(pd.DataFrame(), chamadas)),
    )
    assert asyncio.run(carregar.carregar("teste", tmp_path, HOJE)) == (0, 0)
    assert chamadas == [1]
    assert not (tmp_path / "clima_celula" / "vazia.parquet").exists()
    assert not (tmp_path / "_manifesto.jsonl").exists()


def test_carregar_grava_registra_e_depois_pula(tmp_path, monkeypatch):
    chamadas = []
    carga = carregar.Carga(
        "clima_celula", "uma", _chamada(pd.DataFrame({"x": [1]}), chamadas)
    )
    _grupo(monkeypatch, carga)
    asyncio.run(carregar.carregar("teste", tmp_path, HOJE))
    asyncio.run(carregar.carregar("teste", tmp_path, HOJE))
    assert chamadas == [1]
    registro = json.loads((tmp_path / "_manifesto.jsonl").read_text(encoding="utf-8"))
    assert (registro["nome"], registro["linhas"]) == ("uma", 1)
    assert not list((tmp_path / "clima_celula").glob("*.tmp"))


def test_carregar_renova_mesmo_registrada(tmp_path, monkeypatch):
    chamadas = []
    _grupo(
        monkeypatch,
        carregar.Carga(
            "clima_celula",
            "viva",
            _chamada(pd.DataFrame({"x": [1]}), chamadas),
            renovar=True,
        ),
    )
    asyncio.run(carregar.carregar("teste", tmp_path, HOJE))
    asyncio.run(carregar.carregar("teste", tmp_path, HOJE))
    assert chamadas == [1, 1]


def test_carregar_registra_a_falha_e_segue(tmp_path, monkeypatch):
    async def quebra():
        raise RuntimeError("fonte fora do ar")

    chamadas = []
    _grupo(
        monkeypatch,
        carregar.Carga("clima_celula", "quebrada", quebra),
        carregar.Carga(
            "clima_celula", "boa", _chamada(pd.DataFrame({"x": [1]}), chamadas)
        ),
    )
    assert asyncio.run(carregar.carregar("teste", tmp_path, HOJE)) == (1, 0)
    erro = json.loads((tmp_path / "_erros.jsonl").read_text(encoding="utf-8"))
    assert erro["nome"] == "quebrada"
    assert "fonte fora do ar" in erro["erro"]
    assert (tmp_path / "clima_celula" / "boa.parquet").exists()


def test_carregar_depois_do_prazo_deixa_pendente(tmp_path, monkeypatch):
    chamadas = []
    _grupo(
        monkeypatch,
        *(
            carregar.Carga(
                "clima_celula", f"c{i}", _chamada(pd.DataFrame({"x": [i]}), chamadas)
            )
            for i in range(3)
        ),
    )
    assert asyncio.run(carregar.carregar("teste", tmp_path, HOJE, prazo=0)) == (0, 3)
    assert chamadas == []
