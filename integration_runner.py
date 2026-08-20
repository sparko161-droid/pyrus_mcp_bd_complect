import sys
import json
import asyncio
import subprocess
import os

env = os.environ.copy()
env["PYRUS_SECURITY_KEY"] = "AoTR6E2Zq2G35ZivN95wr8CV5gyABUYny98S50cknXo20alXtVaHow4L7NpxZhe-~iyrZbCPr5NFpXBD7OK5pGs6UHZbXeom"
env["PYRUS_LOGIN"] = "admin@standartmaster.ru"
env["PYRUS_PERSON_ID"] = "1238106"
env["MCP_TRANSPORT"] = "stdio"

class MCPClient:
    def __init__(self):
        self.proc = subprocess.Popen(
            [r"pyrus_mcp_server\.venv\Scripts\python.exe", "-m", "pyrus_mcp.server"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            text=True,
            bufsize=1
        )
        self.msg_id = 1
        self.log_file = open("mcp_debug_log.jsonl", "w", encoding="utf-8")

    def _log(self, direction, msg):
        log_entry = {"direction": direction, "message": msg}
        self.log_file.write(json.dumps(log_entry, ensure_ascii=False) + "\n")
        self.log_file.flush()

    def send_request(self, method, params=None):
        req = {"jsonrpc": "2.0", "id": self.msg_id, "method": method}
        if params: req["params"] = params
        self.msg_id += 1
        
        req_str = json.dumps(req)
        self._log("SEND", req)
        self.proc.stdin.write(req_str + "\n")
        self.proc.stdin.flush()
        
        while True:
            line = self.proc.stdout.readline()
            if not line: break
            try:
                resp = json.loads(line)
                self._log("RECV", resp)
                if "id" in resp and resp["id"] == req["id"]:
                    return resp
            except json.JSONDecodeError:
                pass

    def close(self):
        self.proc.terminate()
        self.log_file.close()

async def run_tests():
    client = MCPClient()
    report = []
    
    def log_report(msg):
        print(msg)
        report.append(msg)
    
    log_report("# Comprehensive MCP Integration Test Report")
    client.send_request("initialize", {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "qa-client", "version": "1.0"}})
    
    def call_tool(name, args):
        log_report(f"\n### Tool: {name}")
        res = client.send_request("tools/call", {"name": name, "arguments": args})
        if "error" in res:
            log_report(f"[ERR] Error: {res['error']}")
            return None
        content = res.get("result", {}).get("content", [])
        if not content: return None
        try:
            data = json.loads(content[0]["text"])
            if isinstance(data, dict) and ("error_code" in data or "error" in data):
                 log_report(f"[ERR] API Error: {json.dumps(data)}")
            else:
                 log_report(f"[OK] Success. Snippet: {str(data)[:150]}...")
            return data
        except Exception as e:
            log_report(f"[ERR] Parse Error: {e} - content: {content[0]['text']}")
            return None

    form_id = 2371445
    person_id = 1238106

    log_report("\n## 1. Reads (GET endpoints)")
    for t in ["get_profile", "get_contacts", "get_bots", "get_roles", "get_forms", "get_catalogs", "get_lists", "get_announcements", "get_kb_structure"]:
        call_tool(t, {})

    call_tool("get_inbox", {"item_count": 2})
    call_tool("get_registry", {"form_id": form_id, "item_count": 2})
    call_tool("get_calendar_tasks", {"start_date_utc": "2026-08-01T00:00:00Z", "end_date_utc": "2026-08-30T00:00:00Z", "item_count": 2})
    call_tool("get_form_permissions", {"id": form_id})

    log_report("\n## 2. Task Lifecycle")
    task_res = call_tool("create_task", {"text": "Master Test Task", "form_id": form_id, "fields": [{"id": 33, "value": "QA Value", "type": "text"}]})
    
    if task_res and "task" in task_res:
        tid = task_res["task"]["id"]
        call_tool("get_task", {"id": tid})
        call_tool("get_tasks", {"task_ids": [tid]})
        call_tool("add_comment", {"task_id": tid, "text": "Test Comment"})
        call_tool("update_task_fields", {"task_id": tid, "fields": [{"id": 33, "type": "text", "value": "New Value"}]})
        call_tool("assign_task", {"task_id": tid, "person": {"id": person_id}})
        call_tool("add_approvers", {"task_id": tid, "approvers": [[{"id": person_id}]]})
        call_tool("add_subscribers", {"task_id": tid, "subscribers": [{"id": person_id}]})
        call_tool("close_task", {"task_id": tid, "text": "Closing"})
        call_tool("reopen_task", {"task_id": tid, "text": "Reopening"})
        call_tool("delete_task", {"task_id": tid})

    log_report("\n## 3. Role Lifecycle")
    role_res = call_tool("create_role", {"name": "TEST_ROLE_99", "member_ids": [person_id]})
    if role_res and "role" in role_res:
        rid = role_res["role"]["id"]
        call_tool("get_role", {"id": rid})
        call_tool("update_role", {"id": rid, "name": "TEST_ROLE_99_UPDATED", "member_ids": [person_id]})
        call_tool("delete_role", {"id": rid})

    log_report("\n## 4. Catalogs")
    cat_res = call_tool("create_catalog", {"name": "TEST_CAT", "catalog_headers": ["Col1", "Col2"]})
    if cat_res and "catalog_id" in cat_res:
        cid = cat_res["catalog_id"]
        call_tool("get_catalog", {"catalog_id": cid})
        call_tool("sync_catalog", {"id": cid, "apply": True, "catalog_headers": ["Col1", "Col2"], "items": [{"values": ["A", "B"]}]})
        call_tool("update_catalog_items", {"id": cid, "added": [{"values": ["C", "D"]}], "deleted": [], "updated": []})

    with open("mcp_test_report_full.md", "w", encoding="utf-8") as f:
        f.write("\n".join(report))
        
    client.close()

if __name__ == "__main__":
    asyncio.run(run_tests())
