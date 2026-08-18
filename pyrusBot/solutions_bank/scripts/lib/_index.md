---
title: "lib"
audience: "internal"
pyrus_id: "H3dq6ShYqwW"
pyrus_parent: "NdhSSmXd5R1"
synced_at: "2026-08-07T14:51:10.234Z"
synced_hash: "sha256:75898ea8ab8e368a27286a0738883467"
---

Модули, общие для скриптов автоматизации: загрузка конфигурации и клиент Pyrus (`env.ts`), чтение и запись YAML-заголовков документации (`frontmatter.ts`).

Ни один скрипт не читает `.env` сам и не хранит ID разделов Базы знаний в коде — всё идёт через эти модули.
