# Runbook: High Error Rate

**Alert:** `HighErrorRate`
**Severity:** Critical

## Признаки
Более 5% HTTP-запросов к MCP-серверу возвращают статус `5xx` на протяжении 5 минут.

## Диагностика

```bash
# 1. Посмотреть свежие структурированные логи
docker logs pyrus-mcp-server --tail=100 | grep '"level":"error"'

# 2. Открыть Prometheus и проверить разбивку по роутам
# Запрос: rate(pyrus_mcp_requests_total{status_code=~"5.."}[5m]) by (path)

# 3. Проверить /health и /ready
curl http://localhost:8000/health
curl http://localhost:8000/ready
```

## Возможные причины и действия

| Причина | Действие |
|:--------|:---------|
| Недоступен Pyrus API | Перейти к [Runbook: Pyrus API Down](./pyrus-api-down.md) |
| Ошибка в новом деплое | Откатить версию: `git revert HEAD && docker build + restart` |
| Переполнение базы данных SQLite | Проверить размер `data/pyrus_mcp.db`, очистить старые webhook_events |
| OOM — нехватка памяти | Перезапустить контейнер, увеличить лимит памяти в docker-compose |

## Эскалация
Если проблема не устранена в течение **15 минут** — эскалировать в Telegram-канал `#pyrus-mcp-incidents`.
