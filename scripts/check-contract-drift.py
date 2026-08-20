import re
from pathlib import Path
import sys

def main():
    root = Path(__file__).resolve().parent.parent
    tools_dir = root / "pyrus_mcp_server" / "src" / "pyrus_mcp" / "tools"
    
    registered_tools = set()
    if tools_dir.exists():
        for py_file in tools_dir.glob("*.py"):
            content = py_file.read_text(encoding="utf-8")
            matches = re.finditer(r'@tool_registry\.register\s*\(\s*name\s*=\s*["\']([^"\']+)["\']', content)
            for m in matches:
                registered_tools.add(m.group(1))
                
    matrix_path = root / "docs" / "audits" / "2026-08-pyrus-api-compliance-matrix.md"
    if not matrix_path.exists():
        print("Matrix file not found.")
        sys.exit(1)
        
    matrix_content = matrix_path.read_text(encoding="utf-8")
    
    rows = []
    for line in matrix_content.splitlines():
        if "|" in line and "ID" not in line and "---" not in line and "Contract" not in line:
            parts = [p.strip() for p in line.split("|")]
            if len(parts) >= 5 and parts[1].startswith("PY-"):
                method_id = parts[1]
                name = parts[2]
                status = parts[4].lower()
                action = parts[5] if len(parts) > 5 else ""
                rows.append({"id": method_id, "name": name, "status": status, "action": action})

    missing_items = []
    
    for r in rows:
        if "missing" in r["status"]:
            # Check ADR exclusion
            if "out_of_scope" in r["status"] or "adr" in r["action"].lower() or "adr" in r["status"].lower():
                continue
            
            # Check if there is a corresponding tool
            # Convert name to snake_case for simple matching
            snake_name = r["name"].lower().replace(' ', '_').replace('/', '_')
            
            # Does any registered tool match this missing method?
            # E.g. "get_form_permissions", or maybe the tool is named "get_permissions"
            has_tool = False
            for t in registered_tools:
                # simple heuristic for match
                t_words = set(t.split('_'))
                m_words = set(snake_name.split('_'))
                if t == snake_name or (len(t_words & m_words) >= 2):
                    has_tool = True
                    break
                    
            if not has_tool:
                missing_items.append(r)
                
    print(f"Total registered tools found: {len(registered_tools)}")
    print(f"Total missing methods in matrix: {sum('missing' in r['status'] for r in rows)}")
    
    if missing_items:
        print("\nError: Found missing methods with NO corresponding tool AND NO ADR exclusion:")
        for m in missing_items:
            print(f"  - {m['id']} {m['name']} ({m['status']})")
        sys.exit(1)
        
    print("Contract drift check passed.")
    sys.exit(0)

if __name__ == "__main__":
    main()
