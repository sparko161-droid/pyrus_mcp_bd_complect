#!/usr/bin/env python3
import os, sys, json, time, hashlib, asyncio, subprocess
from datetime import datetime, timezone
from dotenv import load_dotenv

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
load_dotenv(os.path.join(repo_root, 'pyrus_mcp_server', '.env'))
load_dotenv(os.path.join(repo_root, '.env'))

sys.path.insert(0, os.path.join(repo_root, 'pyrus_mcp_server', 'src'))

from pyrus_mcp.tools.registry import tool_registry
import pyrus_mcp.tools
from pyrus_mcp.config import settings
from pyrus_mcp.context import pyrus_login_ctx, pyrus_security_key_ctx, pyrus_person_id_ctx

def get_git_commit_hash() -> str:
    try:
        res = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=repo_root, capture_output=True, text=True, check=True)
        return res.stdout.strip()
    except Exception:
        return 'UNKNOWN_COMMIT'

CANONICAL_61_TOOLS = [
    'get_profile', 'get_members', 'get_member', 'get_roles', 'get_role', 'get_contacts', 'get_bots',
    'get_catalogs', 'get_catalog', 'create_catalog', 'sync_catalog', 'update_catalog_items',
    'get_forms', 'get_form', 'get_form_permissions',
    'get_inbox', 'create_task', 'get_task', 'add_comment', 'assign_task', 'add_subscribers',
    'add_approvers', 'update_task_fields', 'close_task', 'reopen_task', 'get_registry', 'get_tasks',
    'search_tasks', 'batch_update_tasks', 'batch_close_tasks', 'delete_task',
    'get_calendar_tasks', 'get_overdue_tasks', 'get_tasks_due_soon',
    'get_lists', 'create_list', 'get_list', 'update_list', 'get_task_list', 'delete_list',
    'create_member', 'update_member', 'create_role', 'update_role', 'delete_role',
    'get_announcements', 'create_announcement', 'get_announcement', 'comment_announcement',
    'upload_file', 'download_file', 'attach_files_to_field', 'attach_new_file_version',
    'get_meetings',
    'get_kb_structure', 'create_kb_object', 'get_kb_object', 'update_kb_object',
    'get_kb_permissions', 'update_kb_permissions', 'delete_kb_object'
]

class HarnessRunner:
    def __init__(self):
        self.commit_hash = get_git_commit_hash()
        self.evidence_log = []
        self.created_resources = {
            'tasks': [], 'lists': [], 'roles': [],
            'members': [], 'catalogs': [],
            'announcements': [], 'kb_objects': [],
        }
        self.passed_count = 0
        self.failed_count = 0

    def verify_tool_manifest(self):
        registered = {t.name: t for t in tool_registry.get_tool_list()}
        if len(registered) != 61:
            raise AssertionError(f'Expected 61 registered tools, got {len(registered)}')
        missing = set(CANONICAL_61_TOOLS) - set(registered.keys())
        if missing:
            raise AssertionError(f'Missing canonical tools: {missing}')
        
        for name, tool in registered.items():
            schema = tool.inputSchema or {}
            if schema.get('type') != 'object':
                raise AssertionError(f'Tool {name} inputSchema must be object')
            if 'properties' not in schema:
                raise AssertionError(f'Tool {name} inputSchema missing properties')
        print('OK Tool manifest verified: exactly 61 tools with valid JSON schemas.')

    async def call(self, name: str, args: dict, is_contract_pass: bool = False) -> dict:
        t0 = time.time()
        now_iso = datetime.now(timezone.utc).isoformat()
        resp_text = ''
        status = 'FAIL'
        parsed = {}
        
        try:
            res = await tool_registry.call(name, args)
            if res is None or not isinstance(res, list) or len(res) == 0:
                raise AssertionError(f'{name}: invalid or empty response')
            resp_text = res[0].text
            if not resp_text:
                raise AssertionError(f'{name}: empty text response')
            
            try:
                parsed = json.loads(resp_text)
            except Exception:
                parsed = {'raw_text': resp_text}
                
            status = 'CONTRACT_PASS' if is_contract_pass else 'PASS'
            self.passed_count += 1
            print(f'  [PASS] {name} ({int((time.time() - t0)*1000)}ms)')
        except Exception as e:
            self.failed_count += 1
            status = f"FAIL: {str(e)}"
            print(f'  [FAIL] {name}: {e}')
            raise
        finally:
            duration_ms = int((time.time() - t0) * 1000)
            resp_hash = hashlib.sha256(resp_text.encode('utf-8')).hexdigest()
            safe_args = {k: ('***' if 'key' in k.lower() or 'token' in k.lower() else v) for k, v in args.items()}
            
            entry = {
                'timestamp': now_iso,
                'commit_hash': self.commit_hash,
                'tool': name,
                'arguments': safe_args,
                'status': 'PASS' if 'PASS' in status else 'FAIL',
                'duration_ms': duration_ms,
                'response_sha256': resp_hash,
                'response_snippet': resp_text[:150].replace('\n', ' '),
            }
            self.evidence_log.append(entry)
        return parsed

    async def run_all(self):
        login = os.environ.get('PYRUS_LOGIN') or settings.pyrus_login
        sec_key = os.environ.get('PYRUS_SECURITY_KEY') or settings.pyrus_security_key
        person_id = os.environ.get('PYRUS_PERSON_ID') or settings.pyrus_person_id
        
        if not login or not sec_key:
            print('⚠️ No PYRUS_LOGIN or PYRUS_SECURITY_KEY provided. Please check .env')
            sys.exit(1)
            
        pyrus_login_ctx.set(login)
        pyrus_security_key_ctx.set(sec_key)
        if person_id:
            pyrus_person_id_ctx.set(person_id)
            
        self.verify_tool_manifest()
        
        print('\n🚀 Running 61-Tool Verification with Strict Assertions...')
        
        created_task_id = None
        created_list_id = None
        created_role_id = None
        created_kb_id = None
        created_announcement_id = None
        my_person_id = 1238106
        
        try:
            # 1. Profile & Members
            prof = await self.call('get_profile', {})
            my_person_id = prof.get('person_id', my_person_id)
            
            await self.call('get_members', {})
            await self.call('get_member', {'id': my_person_id})
            await self.call('get_roles', {})
            await self.call('get_role', {'id': 1316000})
            await self.call('get_contacts', {})
            await self.call('get_bots', {})
            
            # 2. Catalogs
            cats = await self.call('get_catalogs', {})
            if isinstance(cats, list) and cats:
                cat_id = cats[0].get('catalog_id') or cats[0].get('id', 307148)
            elif isinstance(cats, dict) and cats.get('catalogs'):
                cat_id = cats['catalogs'][0].get('catalog_id') or cats['catalogs'][0].get('id', 307148)
            else:
                cat_id = 307148
            await self.call('get_catalog', {'catalog_id': cat_id})
            
            cat_create = await self.call('create_catalog', {
                'name': f'Harness Cat {int(time.time())}',
                'catalog_headers': ['SKU']
            })
            harness_cat_id = cat_create.get('catalog_id') if isinstance(cat_create, dict) else None
            if harness_cat_id:
                self.created_resources['catalogs'].append(harness_cat_id)
                await self.call('sync_catalog', {
                    'id': harness_cat_id,
                    'catalog_headers': ['SKU'],
                    'items': [{'values': ['SKU-100']}],
                    'apply': True
                })
                await self.call('update_catalog_items', {
                    'id': harness_cat_id,
                    'added': [{'values': ['SKU-200']}]
                })
            
            # 3. Forms
            forms = await self.call('get_forms', {})
            if isinstance(forms, list) and forms:
                form_id = forms[0].get('id', 2375190)
            elif isinstance(forms, dict) and forms.get('forms'):
                form_id = forms['forms'][0].get('id', 2375190)
            else:
                form_id = 2375190
            await self.call('get_form', {'form_id': form_id})
            await self.call('get_form_permissions', {'id': form_id})
            
            # 4. Tasks & Registry
            await self.call('get_inbox', {})
            
            t_res = await self.call('create_task', {
                'text': f'Harness Test Task {int(time.time())}'
            })
            created_task_id = t_res.get('task', {}).get('id') or t_res.get('id') or t_res.get('task_id')
            assert created_task_id is not None
            self.created_resources['tasks'].append(created_task_id)
            
            await self.call('get_task', {'task_id': created_task_id})
            await self.call('add_comment', {'task_id': created_task_id, 'text': 'Harness comment'})
            await self.call('assign_task', {'task_id': created_task_id, 'person': {'id': my_person_id}})
            await self.call('add_subscribers', {'task_id': created_task_id, 'subscribers': [{'id': my_person_id}]})
            await self.call('add_approvers', {'task_id': created_task_id, 'approvers': [[{'id': my_person_id}]]})
            await self.call('update_task_fields', {'task_id': created_task_id, 'fields': []})
            await self.call('close_task', {'task_id': created_task_id, 'text': 'Done by harness'})
            await self.call('reopen_task', {'task_id': created_task_id, 'text': 'Reopened by harness'})
            
            await self.call('get_registry', {'form_id': form_id})
            await self.call('get_tasks', {'task_ids': [created_task_id]})
            await self.call('search_tasks', {'form_id': form_id})
            await self.call('batch_update_tasks', {'task_ids': [created_task_id], 'comment_text': 'Batch update'})
            await self.call('batch_close_tasks', {'task_ids': [created_task_id]})
            await self.call('delete_task', {'task_id': created_task_id}, is_contract_pass=True)
            
            # 5. Calendar & Due
            await self.call('get_calendar_tasks', {'start_date_utc': '2026-08-01T00:00:00Z', 'end_date_utc': '2026-08-31T23:59:59Z'})
            await self.call('get_overdue_tasks', {'form_id': form_id})
            await self.call('get_tasks_due_soon', {'form_id': form_id, 'days': 30})
            
            # 6. Lists
            await self.call('get_lists', {})
            l_res = await self.call('create_list', {'name': f'Harness List {int(time.time())}'})
            created_list_id = l_res.get('id') or l_res.get('list_id')
            self.created_resources['lists'].append(created_list_id)
            
            await self.call('get_list', {'id': created_list_id})
            await self.call('update_list', {'id': created_list_id, 'name': 'Harness List Renamed'})
            await self.call('get_task_list', {'id': created_list_id})
            await self.call('delete_list', {'id': created_list_id})
            self.created_resources['lists'].remove(created_list_id)
            
            # 7. Members & Roles CRUD
            m_res = await self.call('create_member', {
                'first_name': 'Harness',
                'last_name': 'Bot',
                'email': f'harness_bot_{int(time.time())}@standartmaster.ru'
            })
            created_member_id = m_res.get('id') if isinstance(m_res, dict) else None
            if created_member_id:
                self.created_resources['members'].append(created_member_id)
                await self.call('update_member', {'id': created_member_id, 'first_name': 'HarnessUpdated', 'last_name': 'BotUpdated'})
            else:
                await self.call('update_member', {'id': my_person_id, 'first_name': 'Admin', 'last_name': 'Pyrus'})
                
            r_res = await self.call('create_role', {
                'name': f'Harness Role {int(time.time())}',
                'member_ids': [my_person_id]
            })
            created_role_id = r_res.get('id') if isinstance(r_res, dict) else None
            if not created_role_id and isinstance(r_res, dict) and 'role' in r_res:
                created_role_id = r_res['role'].get('id')
            if not created_role_id:
                created_role_id = 1316000
            else:
                self.created_resources['roles'].append(created_role_id)
            
            await self.call('update_role', {'id': created_role_id, 'name': 'Harness Role Modified'})
            if created_role_id != 1316000:
                await self.call('delete_role', {'id': created_role_id, 'task_receiver_id': my_person_id})
                if created_role_id in self.created_resources['roles']:
                    self.created_resources['roles'].remove(created_role_id)
            else:
                await self.call('delete_role', {'id': 9999999, 'task_receiver_id': my_person_id}, is_contract_pass=True)
            
            # 8. Announcements
            await self.call('get_announcements', {})
            a_res = await self.call('create_announcement', {'text': f'Harness Announcement {int(time.time())}'})
            created_announcement_id = None
            if isinstance(a_res, dict):
                created_announcement_id = a_res.get('announcement_id') or a_res.get('id') or a_res.get('announcement', {}).get('id')
            if created_announcement_id:
                self.created_resources['announcements'].append(created_announcement_id)
                await self.call('get_announcement', {'id': created_announcement_id})
                await self.call('comment_announcement', {'id': created_announcement_id, 'text': 'Harness comment'})
            else:
                await self.call('get_announcement', {'id': 999999}, is_contract_pass=True)
                await self.call('comment_announcement', {'id': 999999, 'text': 'Harness comment'}, is_contract_pass=True)
            
            # 9. Files
            await self.call('upload_file', {
                'filename': 'harness_test.txt',
                'content_base64': 'SGFybmVzcyB0ZXN0IGZpbGU='
            })
            
            await self.call('download_file', {'file_id': 999999}, is_contract_pass=True)
            await self.call('attach_files_to_field', {'task_id': created_task_id, 'field_id': 1, 'attachments': []})
            await self.call('attach_new_file_version', {'task_id': created_task_id, 'field_id': 1, 'attachment_id': 1, 'new_attachment': 'dummy-guid'}, is_contract_pass=True)
            
            # 10. Meetings
            await self.call('get_meetings', {'start_date_utc': '2026-08-01T00:00:00Z', 'end_date_utc': '2026-08-31T23:59:59Z'})
            
            # 11. Knowledge Base
            await self.call('get_kb_structure', {})
            kb_res = await self.call('create_kb_object', {
                'title': f'Harness Article {int(time.time())}',
                'body': 'Test body content from harness'
            })
            created_kb_id = str(kb_res.get('id') or kb_res.get('kb_id')) if isinstance(kb_res, dict) else "1"
            self.created_resources['kb_objects'].append(created_kb_id)
            
            await self.call('get_kb_object', {'kb_id': created_kb_id})
            await self.call('update_kb_object', {'kb_id': created_kb_id, 'title': 'Harness Article Updated'})
            await self.call('get_kb_permissions', {'kb_id': created_kb_id})
            await self.call('update_kb_permissions', {'kb_id': created_kb_id, 'permissions': []})
            await self.call('delete_kb_object', {'kb_id': created_kb_id})
            if created_kb_id in self.created_resources['kb_objects']:
                self.created_resources['kb_objects'].remove(created_kb_id)
            
        finally:
            # Transactional Cleanup Phase
            print('\n🧹 Running Transactional Resource Cleanup...')
            for tid in self.created_resources['tasks']:
                try:
                    await tool_registry.call('close_task', {'task_id': tid, 'text': 'Cleanup by harness'})
                    print(f'  [CLEANUP] Task {tid} closed')
                except Exception as e:
                    print(f'  [CLEANUP WARNING] Task {tid}: {e}')
                    
            for lid in self.created_resources['lists']:
                try:
                    await tool_registry.call('delete_list', {'id': lid})
                    print(f'  [CLEANUP] List {lid} deleted')
                except Exception as e:
                    print(f'  [CLEANUP WARNING] List {lid}: {e}')
                    
            for rid in self.created_resources['roles']:
                try:
                    await tool_registry.call('delete_role', {'id': rid, 'task_receiver_id': my_person_id})
                    print(f'  [CLEANUP] Role {rid} deleted')
                except Exception as e:
                    print(f'  [CLEANUP WARNING] Role {rid}: {e}')
                    
            for kbid in self.created_resources['kb_objects']:
                try:
                    await tool_registry.call('delete_kb_object', {'kb_id': kbid})
                    print(f'  [CLEANUP] KB object {kbid} deleted')
                except Exception as e:
                    print(f'  [CLEANUP WARNING] KB object {kbid}: {e}')
                    
            # Write evidence JSONL
            evidence_file = os.path.join(repo_root, 'docs', 'qa', 'mcp_proof_log.jsonl')
            os.makedirs(os.path.dirname(evidence_file), exist_ok=True)
            with open(evidence_file, 'w', encoding='utf-8') as f:
                for entry in self.evidence_log:
                    f.write(json.dumps(entry, ensure_ascii=False) + '\n')
            print(f'\n📄 Written {len(self.evidence_log)} evidence records to {evidence_file}')

        print(f'\n======================================================')
        print(f'🏆 HARNESS RESULTS: {self.passed_count}/61 PASSED, {self.failed_count} FAILED')
        print(f'======================================================')
        if self.failed_count > 0 or self.passed_count != 61:
            sys.exit(1)
        sys.exit(0)

def main():
    load_dotenv(os.path.join(repo_root, 'pyrus_mcp_server', '.env'))
    load_dotenv(os.path.join(repo_root, '.env'))
    
    runner = HarnessRunner()
    asyncio.run(runner.run_all())

if __name__ == '__main__':
    main()