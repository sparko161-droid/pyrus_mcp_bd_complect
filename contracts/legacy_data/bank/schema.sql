-- =====================================================================
-- Банк решений: версионное хранилище знаний с зонами и промоушеном
--
-- Модель в трёх предложениях:
--   Запись (entry) — логическая единица: решение, функция, кейс, клиент, бот.
--   Версия (entry_version) — неизменяемый снимок. Правок «на месте» нет,
--   любое изменение создаёт новую версию.
--   Зона (zone) — где запись живёт. Каждый пишет в свою, в общую попадает
--   только через промоушен с ревью.
--
-- Размерность вектора: 1536 (OpenAI text-embedding-3-small).
-- Меняете модель — правьте vector(1536) здесь и EMBEDDING_DIM в сервере.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------- зоны

CREATE TABLE IF NOT EXISTS zone (
    id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    key         text UNIQUE NOT NULL,            -- 'shared', 'u:ivan@…', 't:integrations'
    kind        text NOT NULL CHECK (kind IN ('personal', 'team', 'shared')),
    title       text NOT NULL,
    owner       text,                            -- для personal — email владельца
    reviewers   text[] NOT NULL DEFAULT '{}',    -- кто вправе одобрять промоушен сюда
    members     text[] NOT NULL DEFAULT '{}',    -- кто вправе писать (для team)
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Общая зона одна и создаётся сразу. Ревьюеров назначите отдельным UPDATE.
INSERT INTO zone (key, kind, title, reviewers)
VALUES ('shared', 'shared', 'Общий банк решений', '{}')
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------- записи

CREATE TABLE IF NOT EXISTS entry (
    id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_id      uuid NOT NULL REFERENCES zone(id) ON DELETE RESTRICT,
    kind         text NOT NULL CHECK (kind IN (
                    'solution',   -- готовое решение задачи
                    'function',   -- универсальная функция, сниппет кода
                    'case',       -- успешный кейс, разбор
                    'client',     -- данные и конфигурация клиента
                    'bot',        -- конфигурация бота
                    'playbook',   -- регламент, последовательность шагов
                    'note'        -- всё остальное
                 )),
    slug         text NOT NULL,                  -- человекочитаемый ключ внутри зоны
    created_by   text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    archived_at  timestamptz,
    -- Откуда пришло, если это результат промоушена:
    origin_entry_id uuid REFERENCES entry(id) ON DELETE SET NULL,
    UNIQUE (zone_id, kind, slug)
);

CREATE INDEX IF NOT EXISTS entry_zone_kind_idx ON entry (zone_id, kind)
    WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS entry_slug_trgm_idx ON entry USING gin (slug gin_trgm_ops);

-- ---------------------------------------------------------------- версии

CREATE TABLE IF NOT EXISTS entry_version (
    id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id      uuid NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
    version       integer NOT NULL,
    title         text NOT NULL,
    summary       text NOT NULL DEFAULT '',      -- 1–3 предложения: что это и когда брать
    body          text NOT NULL DEFAULT '',      -- markdown: подробности, код, разбор
    payload       jsonb NOT NULL DEFAULT '{}',   -- машинная часть: конфиг, параметры, схема
    tags          text[] NOT NULL DEFAULT '{}',
    -- Те же теги строкой. Нужна отдельная колонка, потому что array_to_string
    -- в Postgres помечен STABLE, а generated-выражение требует IMMUTABLE.
    -- Заполняется сервером при вставке.
    tags_text     text NOT NULL DEFAULT '',
    author        text NOT NULL,
    change_note   text NOT NULL DEFAULT '',
    parent_version_id uuid REFERENCES entry_version(id) ON DELETE SET NULL,
    content_hash  text NOT NULL,                 -- sha256, чтобы не плодить дубли
    created_at    timestamptz NOT NULL DEFAULT now(),

    embedding     vector(1536),                  -- NULL, пока не посчитан
    tsv tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('russian', coalesce(title, '')),   'A') ||
        setweight(to_tsvector('russian', coalesce(summary, '')), 'B') ||
        setweight(to_tsvector('russian', coalesce(tags_text, '')), 'B') ||
        setweight(to_tsvector('russian', coalesce(body, '')),    'C')
    ) STORED,

    UNIQUE (entry_id, version)
);

CREATE INDEX IF NOT EXISTS ev_tsv_idx      ON entry_version USING gin (tsv);
CREATE INDEX IF NOT EXISTS ev_entry_idx    ON entry_version (entry_id, version DESC);
CREATE INDEX IF NOT EXISTS ev_tags_idx     ON entry_version USING gin (tags);
CREATE INDEX IF NOT EXISTS ev_hash_idx     ON entry_version (entry_id, content_hash);
-- Векторный индекс: HNSW по косинусу. Создавайте ПОСЛЕ первичной заливки —
-- на пустой таблице он бесполезен, а на большой строится долго.
CREATE INDEX IF NOT EXISTS ev_embedding_idx ON entry_version
    USING hnsw (embedding vector_cosine_ops);

-- Текущая версия записи — вычисляемое представление, а не колонка:
-- колонку легко забыть обновить, представление врать не умеет.
CREATE OR REPLACE VIEW entry_current AS
SELECT DISTINCT ON (ev.entry_id)
       ev.entry_id, ev.id AS version_id, ev.version, ev.title, ev.summary,
       ev.body, ev.payload, ev.tags, ev.author, ev.created_at,
       e.zone_id, e.kind, e.slug, e.created_by, e.archived_at, z.key AS zone_key
FROM entry_version ev
JOIN entry e ON e.id = ev.entry_id
JOIN zone  z ON z.id = e.zone_id
ORDER BY ev.entry_id, ev.version DESC;

-- ---------------------------------------------------------------- промоушен

CREATE TABLE IF NOT EXISTS promotion (
    id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_version_id uuid NOT NULL REFERENCES entry_version(id) ON DELETE CASCADE,
    target_zone_id    uuid NOT NULL REFERENCES zone(id) ON DELETE CASCADE,
    target_slug       text NOT NULL,
    rationale         text NOT NULL DEFAULT '',
    requested_by      text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    state             text NOT NULL DEFAULT 'pending'
                      CHECK (state IN ('pending', 'approved', 'rejected', 'withdrawn')),
    reviewer          text,
    reviewed_at       timestamptz,
    review_note       text NOT NULL DEFAULT '',
    result_entry_id   uuid REFERENCES entry(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS promotion_state_idx ON promotion (state, created_at DESC);
-- Одна открытая заявка на версию: иначе ревьюеры разбирают одно и то же дважды.
CREATE UNIQUE INDEX IF NOT EXISTS promotion_one_open_idx
    ON promotion (source_version_id) WHERE state = 'pending';

-- ---------------------------------------------------------------- связи и сигналы

CREATE TABLE IF NOT EXISTS entry_link (
    from_entry_id uuid NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
    to_entry_id   uuid NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
    rel           text NOT NULL CHECK (rel IN (
                    'supersedes', 'depends_on', 'variant_of', 'derived_from', 'see_also')),
    note          text NOT NULL DEFAULT '',
    created_by    text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (from_entry_id, to_entry_id, rel),
    CHECK (from_entry_id <> to_entry_id)
);

-- Обратная связь: применили решение — отметьтесь. Это единственный честный
-- сигнал качества, и он же двигает ранжирование.
CREATE TABLE IF NOT EXISTS usage_event (
    id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_id uuid NOT NULL REFERENCES entry_version(id) ON DELETE CASCADE,
    actor      text NOT NULL,
    outcome    text NOT NULL CHECK (outcome IN ('helped', 'partial', 'failed')),
    context    text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_version_idx ON usage_event (version_id);

CREATE OR REPLACE VIEW entry_score AS
SELECT e.id AS entry_id,
       count(*) FILTER (WHERE u.outcome = 'helped')  AS helped,
       count(*) FILTER (WHERE u.outcome = 'partial') AS partial,
       count(*) FILTER (WHERE u.outcome = 'failed')  AS failed,
       -- Сглаженная доля успеха: без сглаживания одна удачная отметка
       -- выбрасывает свежую запись на первое место.
       (count(*) FILTER (WHERE u.outcome = 'helped') + 1.0)
       / (count(*) + 2.0) AS success_rate,
       max(u.created_at) AS last_used_at
FROM entry e
LEFT JOIN entry_version ev ON ev.entry_id = e.id
LEFT JOIN usage_event   u  ON u.version_id = ev.id
GROUP BY e.id;

-- ---------------------------------------------------------------- журнал

CREATE TABLE IF NOT EXISTS audit_log (
    id         bigserial PRIMARY KEY,
    actor      text NOT NULL,
    action     text NOT NULL,
    entry_id   uuid,
    version_id uuid,
    detail     jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log (created_at DESC);
