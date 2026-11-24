import importlib.util
from pathlib import Path

RUNNER = Path(__file__).resolve().parents[2] / "evals" / "run_evals.py"


def test_fake_evals_pass_all_six_cases(monkeypatch, capsys):
    spec = importlib.util.spec_from_file_location("run_evals", RUNNER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr("sys.argv", ["run_evals"])
    assert mod.main() == 0
    assert "6/6 cases passed" in capsys.readouterr().out
