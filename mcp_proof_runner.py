import sys, json, asyncio, subprocess, os
from datetime import datetime

env = os.environ.copy()
env["PYRUS_SECURITY_KEY"] = "AoTR6E2Zq2G35ZivN95wr8CV5gyABUYny98S50cknXo20alXtVaHow4L7NpxZhe-~iyrZbCPr5NFpXBD7OK5pGs6UHZbXeom"
env["PYRUS_LOGIN"] = "admin@standartmaster.ru"
env["PYRUS_PERSON_ID"] = "1238106"
env["MCP_TRANSPORT"] = "stdio"

class MCPClient:
    def __init__(self):
        self.proc = subprocess.Popen(
            [r"pyrus_mcp_server\.venv\Scripts\python.exe", "-m", "pyrus_mcp.server"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env=env, text=True, bufsize=1
        )
        self.msg_id = 1
        self.log_file = open("mcp_final_proof.jsonl", "w", encoding="utf-8")

    def _log(self, direction, msg):
        self.log_file.write(json.dumps({"direction": direction, "message": msg}, ensure_ascii=False) + "\n")
        self.log_file.flush()

    def send_request(self, method, params=None):
        req = {"jsonrpc": "2.0", "id": self.msg_id, "method": method}
        if params: req["params"] = params
        self.msg_id += 1
        self._log("SEND", req)
        self.proc.stdin.write(json.dumps(req) + "\n")
        self.proc.stdin.flush()
        
        while True:
            line = self.proc.stdout.readline()
            if not line: break
            try:
                resp = json.loads(line)
                self._log("RECV", resp)
                if "id" in resp and resp["id"] == req["id"]: return resp
            except: pass

    def close(self):
        self.proc.terminate()
        self.log_file.close()

async def run():
    client = MCPClient()
    report = ["# Отчёт о прямом тестировании функционала Pyrus MCP\n"]
    
    def log(msg):
        print(msg)
        report.append(msg)
        
    client.send_request("initialize", {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "qa", "version": "1.0"}})
    
    def call(name, args):
        log(f"\n### Метод: `{name}`")
        res = client.send_request("tools/call", {"name": name, "arguments": args})
        content = res.get("result", {}).get("content", [])
        if not content: return None
        try:
            data = json.loads(content[0]["text"])
            if isinstance(data, dict) and ("error_code" in data or "error" in data):
                log(f"**[ОШИБКА API Pyrus]** {json.dumps(data, ensure_ascii=False)}")
            else:
                log(f"**[УСПЕХ]** Данные получены. Пруф (фрагмент): {str(data)[:200]}...")
            return data
        except Exception as e:
            log(f"**[ОШИБКА ПАРСИНГА]** {e}")
            return None

    # 1. Справочники
    log("\n## 1. Справочники (Catalogs)")
    cat = call("create_catalog", {"name": f"Авто-справочник {datetime.now().strftime('%H:%M:%S')}", "catalog_headers": ["Название", "Код"]})
    if cat and "catalog_id" in cat:
        call("get_catalog", {"catalog_id": cat["catalog_id"]})
        call("sync_catalog", {"id": cat["catalog_id"], "apply": True, "catalog_headers": ["Название", "Код"], "items": [{"values": ["Тест1", "001"]}]})

    # 2. Пользователи
    log("\n## 2. Пользователи (Members)")
    log("> Примечание: API Pyrus не позволяет создавать формы, но позволяет создавать пользователей и задачи.")
    mem = call("create_member", {"first_name": "Тест", "last_name": "МСП", "email": f"test_mcp_{int(datetime.now().timestamp())}@standartmaster.ru"})
    if mem and "member_id" in mem:
        call("update_member", {"member_id": mem["member_id"], "position": "Автоматизатор"})

    # 3. Роли
    log("\n## 3. Роли (Roles)")
    role = call("create_role", {"name": f"Новая Роль {datetime.now().strftime('%H:%M:%S')}", "member_ids": [1238106]})
    if role and "role" in role:
        call("update_role", {"role_id": role["role"]["id"], "name": f"Обновленная Роль {datetime.now().strftime('%H:%M:%S')}", "member_ids": [1238106]})
        call("delete_role", {"role_id": role["role"]["id"]})

    with open("mcp_final_proof_report.md", "w", encoding="utf-8") as f:
        f.write("\n".join(report))
    client.close()

asyncio.run(run())
