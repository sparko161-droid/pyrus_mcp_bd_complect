import yaml
import sys
import os
from pathlib import Path

def main():
    root = Path(__file__).parent.parent
    registry_path = root / "tasks" / "registry.yaml"
    overlay_path = root / "tasks" / "2026-08-audit-overlay.yaml"

    if not registry_path.exists():
        print("Error: registry.yaml not found.")
        sys.exit(1)

    with open(registry_path, "r", encoding="utf-8") as f:
        registry = yaml.safe_load(f)

    # Simplified check for DONE tasks having evidence links and no open P0/P1 dependencies
    tasks = registry.get("tasks", [])
    
    task_dict = {t["id"]: t for t in tasks}

    # Overlay tasks
    if overlay_path.exists():
        with open(overlay_path, "r", encoding="utf-8") as f:
            overlay = yaml.safe_load(f)
            for t in overlay.get("task_overrides", []):
                if t["id"] in task_dict:
                    task_dict[t["id"]].update(t)
            for t in overlay.get("new_tasks", []):
                task_dict[t["id"]] = t

    failed = False
    for t_id, task in task_dict.items():
        if task.get("status") == "DONE":
            # Check for evidence
            if "evidence" not in task or not task["evidence"]:
                print(f"Error: Task {t_id} is DONE but has no evidence.")
                failed = True
            
            # Check dependencies
            for dep_id in task.get("deps", []):
                dep = task_dict.get(dep_id)
                if dep and dep.get("status") != "DONE":
                    if dep.get("priority") in ["P0", "P1"]:
                        print(f"Error: Task {t_id} is DONE but depends on open P0/P1 task {dep_id}.")
                        failed = True

    if failed:
        print("ARCH-C05 Check Failed.")
        sys.exit(1)
    else:
        print("ARCH-C05 Check Passed.")

if __name__ == "__main__":
    main()
