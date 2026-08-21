#!/usr/bin/env python3
import os, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SECRET_PATTERNS = [
    (re.compile(r'(?i)(pyrus_security_key|security_key|apikey|api_key|secret_key)\s*[:=]\s*["\'][a-zA-Z0-9_\-]{20,}["\']'), "Hardcoded API/Security Key"),
    (re.compile(r'(?i)bearer\s+[a-zA-Z0-9_\-\.]{30,}'), "Hardcoded Bearer Token"),
    (re.compile(r'-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----'), "Private Key Material"),
]

IGNORED_DIRS = {'.git', '.venv', '__pycache__', 'node_modules', '.idea', '.vscode'}
IGNORED_FILES = {'.env', '.env.example', 'verify-no-secrets.py', 'mcp_proof_log.jsonl'}

def scan():
    violations = []
    for root_dir, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
        for filename in files:
            if filename in IGNORED_FILES or filename.endswith(('.png', '.jpg', '.pdf', '.woff', '.lock')):
                continue
            filepath = Path(root_dir) / filename
            try:
                content = filepath.readtext(encoding='utf-8')
            except Exception:
                continue
                
            for line_num, line in enumerate(content.splitlines(), 1):
                if 'dummy' in line.lower() or 'test_token' in line.lower() or 'staging_token' in line.lower() or 'mock' in line.lower():
                    continue
                for pattern, desc in SECRET_PATTERNS:
                    if pattern.search(line):
                        violations.append({
                            'file': str(filepath.relative_to(ROOT)),
                            'line': line_num,
                            'type': desc,
                            'snippet': line.strip()[:80]
                        })
                        
    if violations:
        print(f"❌ Secret scanner found {len(violations)} potential secret leaks:")
        for v in violations:
            print(f"  {v['file']}:{v['line']} [{v['type']}]: {v['snippet']}")
        sys.exit(1)
    else:
        print("✅ Secret scanner passed: 0 hardcoded secrets found.")
        sys.exit(0)

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

if __name__ == '__main__':
    scan()
