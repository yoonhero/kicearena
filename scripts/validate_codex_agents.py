from __future__ import annotations

import re
import sys
import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CODEX_DIR = ROOT / ".codex"
CONFIG_PATH = CODEX_DIR / "config.toml"
EXPECTED_AGENTS = {
    "ui_ux_designer",
    "browser_debugger",
    "ui_ux_optimizer",
    "server_throughput_tester",
    "db_maintainer",
    "prometheus_grafana_incident_responder",
}
AGENT_BRIEFS = {
    "ui_ux_designer": "ui-ux-designer.md",
    "browser_debugger": "browser-debugger.md",
    "ui_ux_optimizer": "ui-ux-optimizer.md",
    "server_throughput_tester": "server-throughput-tester.md",
    "db_maintainer": "db-maintainer.md",
    "prometheus_grafana_incident_responder": "prometheus-grafana-incident-responder.md",
}
NICKNAME_RE = re.compile(r"^[A-Za-z0-9 _-]+$")


def fail(message: str) -> None:
    raise SystemExit(f"codex agent validation failed: {message}")


def load_toml(path: Path) -> dict:
    try:
        return tomllib.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - diagnostic path
        fail(f"{path.relative_to(ROOT)} is not valid TOML: {exc}")


def validate_agent_config() -> None:
    if not CONFIG_PATH.exists():
        fail(".codex/config.toml is missing")

    config = load_toml(CONFIG_PATH)
    agents = config.get("agents")
    if not isinstance(agents, dict):
        fail(".codex/config.toml must contain an [agents] table")

    for key, expected in {
        "max_threads": 6,
        "max_depth": 1,
        "job_max_runtime_seconds": 1800,
    }.items():
        if agents.get(key) != expected:
            fail(f"[agents].{key} must be {expected!r}")

    role_names = {key for key, value in agents.items() if isinstance(value, dict)}
    if role_names != EXPECTED_AGENTS:
        fail(f"configured agents differ: expected {sorted(EXPECTED_AGENTS)}, got {sorted(role_names)}")

    for role_name in sorted(role_names):
        role = agents[role_name]
        config_file = role.get("config_file")
        if not isinstance(config_file, str) or not config_file:
            fail(f"[agents.{role_name}].config_file is required")

        agent_path = (CONFIG_PATH.parent / config_file).resolve()
        if not agent_path.exists():
            fail(f"[agents.{role_name}].config_file does not exist: {config_file}")
        if CODEX_DIR not in agent_path.parents:
            fail(f"[agents.{role_name}].config_file must stay under .codex")

        agent = load_toml(agent_path)
        for field in ("name", "description", "developer_instructions"):
            if not isinstance(agent.get(field), str) or not agent[field].strip():
                fail(f"{agent_path.relative_to(ROOT)} missing non-empty {field}")

        if agent["name"] != role_name:
            fail(f"{agent_path.relative_to(ROOT)} name {agent['name']!r} must match config role {role_name!r}")
        if agent["description"] != role.get("description"):
            fail(f"{role_name} description drift between config.toml and agent file")
        if agent.get("nickname_candidates") != role.get("nickname_candidates"):
            fail(f"{role_name} nickname drift between config.toml and agent file")

        nicknames = agent.get("nickname_candidates")
        if not isinstance(nicknames, list) or not nicknames:
            fail(f"{role_name} must define at least one nickname candidate")
        if len(nicknames) != len(set(nicknames)):
            fail(f"{role_name} has duplicate nickname candidates")
        for nickname in nicknames:
            if not isinstance(nickname, str) or not NICKNAME_RE.fullmatch(nickname):
                fail(f"{role_name} has invalid nickname candidate: {nickname!r}")

        brief_path = CODEX_DIR / "agent-briefs" / AGENT_BRIEFS[role_name]
        if not brief_path.exists():
            fail(f"{role_name} is missing role brief {brief_path.relative_to(ROOT)}")
        brief_ref = f".codex/agent-briefs/{AGENT_BRIEFS[role_name]}"
        if brief_ref not in agent["developer_instructions"]:
            fail(f"{agent_path.relative_to(ROOT)} must reference {brief_ref}")
        brief_text = brief_path.read_text(encoding="utf-8")
        if "Mission:" not in brief_text:
            fail(f"{brief_path.relative_to(ROOT)} must include a Mission")


def validate_skills() -> None:
    config = load_toml(CONFIG_PATH)
    skill_entries = config.get("skills", {}).get("config", [])
    if len(skill_entries) != 1:
        fail("expected exactly one [[skills.config]] entry")

    skill_entry = skill_entries[0]
    if skill_entry.get("enabled") is not True:
        fail("kice-subagent-routing skill must be enabled")

    skill_path_value = skill_entry.get("path")
    if not isinstance(skill_path_value, str) or not skill_path_value:
        fail("[[skills.config]].path is required")

    skill_dir = (CONFIG_PATH.parent / skill_path_value).resolve()
    skill_file = skill_dir / "SKILL.md"
    if not skill_file.exists():
        fail(f"configured skill is missing SKILL.md: {skill_path_value}")

    skill_text = skill_file.read_text(encoding="utf-8")
    if not skill_text.startswith("---\n"):
        fail(f"{skill_file.relative_to(ROOT)} must start with YAML frontmatter")
    if "name: kice-subagent-routing" not in skill_text:
        fail(f"{skill_file.relative_to(ROOT)} must name kice-subagent-routing")
    for role_name in EXPECTED_AGENTS:
        if role_name not in skill_text:
            fail(f"{skill_file.relative_to(ROOT)} does not mention {role_name}")


def validate_hygiene() -> None:
    forbidden_names = {".DS_Store"}
    for path in CODEX_DIR.rglob("*"):
        if path.name in forbidden_names:
            fail(f"remove generated file {path.relative_to(ROOT)}")


def main() -> int:
    validate_hygiene()
    validate_agent_config()
    validate_skills()
    print("codex agent validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
