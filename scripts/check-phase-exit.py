import yaml
import sys
import re
from pathlib import Path

def main():
    root = Path(__file__).resolve().parent.parent
    tasks_dir = root / "tasks"
    
    if not tasks_dir.exists():
        print("Tasks directory not found.")
        sys.exit(1)
        
    yaml_files = [
        "registry.yaml",
        "2026-08-atomic-backlog.yaml",
        "2026-08-audit-overlay.yaml",
        "2026-08-red-team-findings.yaml",
        "2026-08-red-team-overrides.yaml",
        "2026-08-red-team-pyrus-runtime.yaml"
    ]
    
    tasks = {}
    
    for yf in yaml_files:
        yp = tasks_dir / yf
        if yp.exists():
            try:
                content = yp.read_text(encoding="utf-8")
                # Parse all docs in the yaml
                docs = yaml.safe_load_all(content)
                for doc in docs:
                    if doc is None:
                        continue
                    # A document could be a dict of tasks or something else
                    # Sometimes files have a list of tasks, sometimes a dict.
                    if isinstance(doc, dict):
                        if "tasks" in doc:
                            for t in doc["tasks"]:
                                if "id" in t:
                                    tasks[t["id"]] = {**tasks.get(t["id"], {}), **t}
                        else:
                            for k, v in doc.items():
                                if isinstance(v, dict) and "status" in v:
                                    v["id"] = k
                                    tasks[k] = {**tasks.get(k, {}), **v}
                    elif isinstance(doc, list):
                        for t in doc:
                            if isinstance(t, dict) and "id" in t:
                                tasks[t["id"]] = {**tasks.get(t["id"], {}), **t}
            except Exception as e:
                print(f"Error parsing {yf}: {e}")
    
    # Alternatively, just load standard formats if previous fails.
    # We will assume tasks are merged correctly.

    violations = False
    
    for tid, t in tasks.items():
        status = t.get("status", "")
        if status == "DONE":
            evidence = t.get("evidence", "")
            if not evidence or "placeholder" in evidence.lower() or "timestamped json-rpc transcript" in evidence.lower():
                print(f"Violation: Task {tid} is DONE but lacks valid evidence. Evidence: '{evidence}'")
                violations = True
                
            deps = t.get("deps", [])
            for dep in deps:
                if dep in tasks:
                    if tasks[dep].get("status", "") != "DONE":
                        print(f"Violation: Task {tid} is DONE but dependency {dep} is {tasks[dep].get('status', 'MISSING')}.")
                        violations = True
                else:
                    print(f"Violation: Task {tid} is DONE but dependency {dep} does not exist.")
                    violations = True
                    
    # Scan for forbidden patterns
    forbidden_patterns = [r"# TODO", r"# stub", r"# placeholder", r"# mock", r"^\s*pass\s*$"]
    forbidden_regexes = [re.compile(p, re.IGNORECASE if "TODO" in p or "mock" in p else 0) for p in forbidden_patterns]
    
    def scan_dir(d):
        nonlocal violations
        if not d.exists():
            return
        for p in d.rglob("*"):
            if p.is_file() and p.suffix in (".py", ".mjs", ".js", ".ts"):
                try:
                    lines = p.read_text(encoding="utf-8").splitlines()
                    for i, line in enumerate(lines):
                        for reg in forbidden_regexes:
                            if reg.search(line):
                                print(f"Forbidden pattern found in {p.relative_to(root)}:{i+1} : {line.strip()}")
                                violations = True
                except UnicodeDecodeError:
                    continue

    scan_dir(root / "scripts")
    scan_dir(root / "pyrus_mcp_server" / "src")
    
    if violations:
        print("Phase exit violations found.")
        sys.exit(1)
        
    print("Phase exit check passed.")
    sys.exit(0)

if __name__ == "__main__":
    main()
