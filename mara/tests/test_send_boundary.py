"""CLAUDE.md rules 1 and 6: only outbound/sender.py::send_message reaches a provider."""

import ast
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1] / "mara"
APP = PACKAGE.parent / "app.py"
FORBIDDEN_IMPORTS = ("twilio", "resend", "egosms", "sentry_sdk")


def _trees():
    for path in [*PACKAGE.rglob("*.py"), APP]:
        yield path, ast.parse(path.read_text(), filename=str(path))


def _imports(tree) -> list[str]:
    names = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names += [a.name for a in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.append(node.module)
            names += [f"{node.module}.{a.name}" for a in node.names]
    return names


def test_no_provider_sdk_anywhere():
    bad = [
        f"{p.name}: {n}"
        for p, t in _trees()
        for n in _imports(t)
        if n.split(".")[0] in FORBIDDEN_IMPORTS
    ]
    assert bad == []


def test_only_the_sender_imports_the_providers_module():
    bad = [
        p.name
        for p, t in _trees()
        if p.name not in ("sender.py", "providers.py")
        and any(n.startswith("mara.outbound.providers") for n in _imports(t))
    ]
    assert bad == []


def test_only_the_sender_calls_provider_send():
    """No `.send(...)` call anywhere in mara/ or app.py except in outbound/sender.py."""
    bad = []
    for path, tree in _trees():
        if path.name == "sender.py":
            continue
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == "send"
            ):
                bad.append(f"{path.name}:{node.lineno}")
    assert bad == []


def test_the_sender_has_exactly_one_provider_call():
    tree = ast.parse((PACKAGE / "outbound" / "sender.py").read_text())
    calls = [
        n
        for n in ast.walk(tree)
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == "send"
    ]
    assert len(calls) == 1


def test_checker_catches_violations(tmp_path):
    bad = tmp_path / "bad.py"
    bad.write_text("import resend\nfrom mara.outbound.providers import EgoSmsProvider\np.send(1)\n")
    tree = ast.parse(bad.read_text())
    assert "resend" in _imports(tree)
    assert any(n.startswith("mara.outbound.providers") for n in _imports(tree))
