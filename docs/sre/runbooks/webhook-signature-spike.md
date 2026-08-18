# Runbook: Webhook Signature Failure Spike

**Alert:** `WebhookSignatureFailureSpike`
**Severity:** Warning

## Признаки
Более 10 запросов в секунду к `/webhook` возвращают `403 Forbidden` из-за неверной подписи `X-Pyrus-Sig`.

## Диагностика

```bash
# 1. Посмотреть IP-адреса источников запросов в логах (если есть access log)
docker logs pyrus-mcp-server --tail=200 | grep "Webhook rejected: Invalid signature"

# 2. Проверить, не изменился ли PYRUS_WEBHOOK_SECRET
# Если ключ был ротирован в Pyrus — нужно обновить .env

# 3. Посмотреть Prometheus:
# rate(pyrus_mcp_webhook_events_total{status="rejected"}[5m])
```

## Возможные причины и действия

| Причина | Действие |
|:--------|:---------|
| Ротация Webhook Secret в Pyrus | Обновить `PYRUS_WEBHOOK_SECRET` в `.env`, перезапустить сервер |
| Сканирование / атака перебором | Заблокировать IP на уровне reverse-proxy (nginx/Cloudflare) |
| Ошибка конфигурации (неверный secret) | Сверить secret с настройками в Pyrus Admin |

## Безопасность
Сервер **не обрабатывает** неавторизованные вебхуки — они отклоняются до парсинга тела запроса. Угрозы утечки данных нет, но DDoS через POST-флуд возможен.

## Эскалация
При подтверждённой атаке — немедленно уведомить security-team и включить rate limiting на nginx.
