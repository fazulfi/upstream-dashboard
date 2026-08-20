"""Test loader gen_finance — baca UPSTREAM_DB env, bukan hardcode 'upstream'."""
import importlib.util
import inspect
import os
import sys
import types

import pytest


@pytest.fixture
def gen_finance_mod(monkeypatch):
    monkeypatch.setenv("UPSTREAM_DB", "postgresql://dummy:dummy@127.0.0.1:1/dummy")
    monkeypatch.setenv("FOREX_KEY", "dummy-key")
    fake_openpyxl = types.ModuleType("openpyxl")
    fake_openpyxl.Workbook = object
    fake_openpyxl.load_workbook = object
    monkeypatch.setitem(sys.modules, "openpyxl", fake_openpyxl)
    root = os.path.join(os.path.dirname(__file__), "..", "..")
    sys.path.insert(0, root)
    spec = importlib.util.spec_from_file_location("gen_finance", os.path.join(root, "scripts", "gen_finance.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    yield mod
    sys.path.pop(0)


def test_gen_finance_tidak_hardcode_db_upstream(gen_finance_mod):
    src = inspect.getsource(gen_finance_mod.load_ledger)
    assert "psql" not in src
    assert '"-d", "upstream"' not in src
    assert "UPSTREAM_DB" in src


def test_gen_finance_import_rule_engine(gen_finance_mod):
    assert gen_finance_mod.compute_finance is not None
