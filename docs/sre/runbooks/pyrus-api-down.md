# Runbook: Pyrus API Down

**Alert:** `PyrusAPIDown`
**Severity:** Critical

## Признаки
100% вызовов к Pyrus API (эндпоинт `/auth` или любой другой) возвращают ошибку в течение 2 минут.

## Диагностика

```bash
# 1. Проверить доступность Pyrus API напрямую
curl -I https://api.pyrus.com/v4/auth

# 2. Проверить статус Pyrus (публичный статус)
# https://status.pyrus.com/

# 3. Проверить метрики
# Prometheus: rate(pyrus_mcp_pyrus_api_calls_total{status_code=~"5.."}[5m])
```

## Возможные причины и действия

| Причина | Действие |
|:--------|:---------|
| Pyrus ведёт плановые работы | Ждать. Проверить status.pyrus.com |
| Истёк/заблокирован `security_key` | Обновить `PYRUS_SECURITY_KEY` в `.env` и перезапустить сервер |
| Неверный `PYRUS_LOGIN` | Проверить логин в Pyrus Admin-панели |
| Сеть/DNS-проблемы внутри контейнера | `docker exec pyrus-mcp curl https://api.pyrus.com/v4/auth` |

## Поведение системы в деградации
Пока Pyrus API недоступен, `PyrusAuthenticator` будет выбрасывать `PyrusAuthError`. Инструменты MCP будут возвращать ошибку 502. Вебхуки и кеши **продолжают работать**.

## Эскалация
Если простой Pyrus превышает **30 минут** — уведомить владельца продукта.
