import ast
from pathlib import Path


def test_agent_tools_cannot_import_cloud_databases() -> None:
    source_path = Path(__file__).parents[1] / "yange_steward" / "agent.py"
    tree = ast.parse(source_path.read_text(encoding="utf-8"))
    imported = {
        alias.name
        for node in ast.walk(tree)
        if isinstance(node, ast.Import)
        for alias in node.names
    }
    imported.update(
        node.module or ""
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom)
    )
    assert not any("firestore" in module or "storage" in module for module in imported)


def test_instruction_preserves_user_agency() -> None:
    source = (Path(__file__).parents[1] / "yange_steward" / "agent.py").read_text(
        encoding="utf-8"
    )
    normalized = " ".join(source.split())
    assert "Never claim that a colour or silhouette objectively flatters" in normalized
    assert "deterministic Yange worker validates every rule" in normalized
