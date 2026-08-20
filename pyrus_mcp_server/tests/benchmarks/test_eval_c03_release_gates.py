"""
EVAL-C03: Release gates benchmark.
Verifies that release gates actually block on policy violations.
"""
import pytest
import os
import re
import yaml
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # pyrus_mcp_bd_complect/


def _scan_for_forbidden_patterns(directory: Path, extensions: tuple = ('.py',)) -> list:
    """Scan source files for forbidden patterns that indicate incomplete code."""
    forbidden = [
        (r'#\s*TODO', 'TODO comment'),
        (r'#\s*stub', 'stub comment'),
        (r'#\s*[Pp]laceholder', 'placeholder comment'),
        (r'#\s*[Mm]ock', 'mock comment'),
        (r'#\s*[Ff]ake', 'fake comment'),
        (r'"authToken":\s*"optional-token"', 'hardcoded fake auth token'),
        (r'\[0\.0\]\s*\*\s*1536', 'mock zero-vector embedding'),
    ]
    violations = []
    for root_dir, _, files in os.walk(directory):
        # Skip test directories and __pycache__
        if '__pycache__' in root_dir or 'tests' in root_dir:
            continue
        for filename in files:
            if not filename.endswith(extensions):
                continue
            filepath = Path(root_dir) / filename
            try:
                content = filepath.read_text(encoding='utf-8')
            except (UnicodeDecodeError, OSError):
                try:
                    content = filepath.read_text(encoding='utf-16-le')
                except (UnicodeDecodeError, OSError):
                    continue
            for line_num, line in enumerate(content.splitlines(), 1):
                for pattern, label in forbidden:
                    if re.search(pattern, line):
                        violations.append({
                            'file': str(filepath.relative_to(ROOT)),
                            'line': line_num,
                            'pattern': label,
                            'content': line.strip()[:100],
                        })
    return violations


def _scan_for_pass_only_functions(directory: Path) -> list:
    """Find functions whose body is only 'pass' (no real implementation)."""
    violations = []
    pass_func_pattern = re.compile(
        r'(async\s+)?def\s+(\w+)\s*\([^)]*\)[^:]*:\s*\n'
        r'(\s+"""[^"]*"""\s*\n)?'  # optional docstring
        r'\s+pass\s*$',
        re.MULTILINE
    )
    for root_dir, _, files in os.walk(directory):
        if '__pycache__' in root_dir:
            continue
        for filename in files:
            if not filename.endswith('.py'):
                continue
            filepath = Path(root_dir) / filename
            try:
                content = filepath.read_text(encoding='utf-8')
            except (UnicodeDecodeError, OSError):
                continue
            for match in pass_func_pattern.finditer(content):
                func_name = match.group(2)
                violations.append({
                    'file': str(filepath.relative_to(ROOT)),
                    'function': func_name,
                })
    return violations


@pytest.mark.benchmark
def test_no_forbidden_patterns_in_pyrus_mcp_source():
    """Production Pyrus MCP code must not contain stub/TODO/mock/placeholder/fake patterns."""
    src_dir = ROOT / 'pyrus_mcp_server' / 'src'
    if not src_dir.exists():
        pytest.skip("pyrus_mcp_server/src not found")
    violations = _scan_for_forbidden_patterns(src_dir)
    assert not violations, (
        f"Found {len(violations)} forbidden pattern(s) in production source:\n"
        + "\n".join(f"  {v['file']}:{v['line']} [{v['pattern']}] {v['content']}" for v in violations[:20])
    )


@pytest.mark.benchmark
def test_no_forbidden_patterns_in_knowledge_source():
    """Knowledge MCP source must not contain stub/TODO/mock patterns."""
    src_dir = ROOT / 'knowledge_mcp_server' / 'src'
    if not src_dir.exists():
        pytest.skip("knowledge_mcp_server/src not found")
    violations = _scan_for_forbidden_patterns(src_dir)
    assert not violations, (
        f"Found {len(violations)} forbidden pattern(s) in knowledge source:\n"
        + "\n".join(f"  {v['file']}:{v['line']} [{v['pattern']}] {v['content']}" for v in violations[:20])
    )


@pytest.mark.benchmark
def test_no_forbidden_patterns_in_scripts():
    """CI/governance scripts must not contain stub/fake-success patterns."""
    scripts_dir = ROOT / 'scripts'
    if not scripts_dir.exists():
        pytest.skip("scripts/ not found")
    violations = _scan_for_forbidden_patterns(scripts_dir)
    assert not violations, (
        f"Found {len(violations)} forbidden pattern(s) in scripts:\n"
        + "\n".join(f"  {v['file']}:{v['line']} [{v['pattern']}] {v['content']}" for v in violations[:20])
    )


@pytest.mark.benchmark
def test_no_pass_only_functions_in_benchmarks():
    """Benchmark test functions must not be pass-only placeholders."""
    bench_dir = ROOT / 'pyrus_mcp_server' / 'tests' / 'benchmarks'
    if not bench_dir.exists():
        pytest.skip("benchmarks/ not found")
    violations = _scan_for_pass_only_functions(bench_dir)
    assert not violations, (
        f"Found {len(violations)} pass-only benchmark function(s):\n"
        + "\n".join(f"  {v['file']} -> {v['function']}()" for v in violations)
    )


@pytest.mark.benchmark
def test_no_status_forging_scripts_in_repo():
    """No status-forging utilities (mark_all_done, force_done, forge_status) should exist."""
    forbidden_names = ['mark_all_done', 'force_done', 'forge_status']
    found = []
    for root_dir, _, files in os.walk(ROOT / 'scripts'):
        for filename in files:
            for forbidden in forbidden_names:
                if forbidden in filename:
                    found.append(os.path.join(root_dir, filename))
    assert not found, f"Status-forging scripts found in repo: {found}"


@pytest.mark.benchmark
def test_task_registries_have_no_mass_done_corruption():
    """Verify that not all tasks across all registries are DONE (sanity check against mass-forge)."""
    task_files = list((ROOT / 'tasks').glob('*.yaml'))
    assert len(task_files) > 0, "No task YAML files found"

    all_statuses = []
    for tf in task_files:
        try:
            data = yaml.safe_load(tf.read_text(encoding='utf-8'))
        except Exception:
            continue
        tasks = data.get('tasks', [])
        for t in tasks:
            status = t.get('status', '')
            if status:
                all_statuses.append(status)

    if len(all_statuses) > 10:
        done_ratio = all_statuses.count('DONE') / len(all_statuses)
        # If literally everything is DONE, it's suspicious
        assert done_ratio < 0.98, (
            f"Suspicious: {done_ratio*100:.0f}% of all tasks are DONE ({all_statuses.count('DONE')}/{len(all_statuses)}). "
            f"This may indicate mass-forging."
        )
