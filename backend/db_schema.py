"""Schema PostgreSQL — SATU-SATUNYA sumber DDL idempotent (R11).

Dipanggil dari `app.db_init()` (backend poller) DAN `full_sync.main()` (CLI
full pull) supaya kedua path selalu membuat 20 tabel yang sama — tidak ada
lagi "tabel hanya dibuat di full_sync, app.py 500 relation does not exist".

Semua statement CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
ALTER TABLE ... ADD COLUMN IF NOT EXISTS — aman dijalankan berulang.
"""


def ensure_schema(cur):
    """Jalankan seluruh DDL idempotent pada cursor yang sudah terbuka."""
    # ── earning history (poller) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS earning_history (
            id BIGSERIAL PRIMARY KEY,
            epoch DOUBLE PRECISION NOT NULL,
            ts TIMESTAMPTZ NOT NULL,
            publisher_lifetime DOUBLE PRECISION NOT NULL,
            balance DOUBLE PRECISION NOT NULL,
            withdrawn DOUBLE PRECISION NOT NULL
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_earning_epoch ON earning_history(epoch)")

    # ── ledger tables ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY,
            upstream TEXT, qty INT, cost_per DOUBLE PRECISION,
            curr TEXT, buy TEXT, lifespan_d INT, status TEXT, label TEXT,
            kurs_idr_usd DOUBLE PRECISION
        )
    """)
    cur.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS kurs_idr_usd DOUBLE PRECISION")
    cur.execute("ALTER TABLE refunds ADD COLUMN IF NOT EXISTS kurs_idr_usd DOUBLE PRECISION")
    # ── Actor log (audit trail siapa mencatat transaksi) — item 9 audit keuangan ──
    cur.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS created_by TEXT")
    cur.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()")
    cur.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS retired_by TEXT")
    cur.execute("ALTER TABLE assets ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ")
    cur.execute("ALTER TABLE refunds ADD COLUMN IF NOT EXISTS created_by TEXT")
    cur.execute("ALTER TABLE refunds ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()")
    cur.execute("ALTER TABLE impairments ADD COLUMN IF NOT EXISTS created_by TEXT")
    cur.execute("ALTER TABLE impairments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()")
    cur.execute("ALTER TABLE payouts ADD COLUMN IF NOT EXISTS created_by TEXT")
    cur.execute("ALTER TABLE payouts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS impairments (
            id TEXT PRIMARY KEY, upstream TEXT, qty INT,
            loss DOUBLE PRECISION, label TEXT, date TEXT, synced_at TIMESTAMPTZ
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS payouts (
            id TEXT PRIMARY KEY, date TEXT, amount_usdc DOUBLE PRECISION,
            status TEXT, destination TEXT, network TEXT,
            signature TEXT, requested_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ, synced_at TIMESTAMPTZ
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ledger_meta (
            k TEXT PRIMARY KEY, v TEXT
        )
    """)

    # ── model ranking publisher (disimpan backend poll -> DB) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS model_ranking (
            model TEXT PRIMARY KEY,
            requests BIGINT,
            avg_price_in DOUBLE PRECISION,
            avg_price_out DOUBLE PRECISION,
            ask_in DOUBLE PRECISION,
            ask_out DOUBLE PRECISION,
            active_providers INT,
            est_earning DOUBLE PRECISION,
            status TEXT,
            updated_at TIMESTAMPTZ
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_mr_requests ON model_ranking(requests DESC)")

    # ── api keys (cluster account/billing/keys) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS api_keys (
            id TEXT PRIMARY KEY, name TEXT, key_prefix TEXT, scopes TEXT,
            created_at TEXT, last_used_at TEXT, expires_at TEXT, replaced_by TEXT,
            secret TEXT, synced_at TIMESTAMPTZ
        )
    """)

    # ── topups ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS topups (
            id TEXT PRIMARY KEY, amount_usdc DOUBLE PRECISION, amount_idr BIGINT,
            payment_method TEXT, status TEXT, payment_url TEXT, topup_key TEXT,
            tako_transaction_id TEXT, qr_data TEXT, qr_svg TEXT, created_at TEXT, synced_at TIMESTAMPTZ
        )
    """)

    # ── budgets (per-model margin) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            upstream_catalog_model_id TEXT PRIMARY KEY, prefix TEXT, upstream_model_id TEXT,
            upstream_label TEXT, official_in DOUBLE PRECISION, official_out DOUBLE PRECISION,
            market_min_ask_in DOUBLE PRECISION, market_min_ask_out DOUBLE PRECISION,
            max_input_per_mtok DOUBLE PRECISION, max_output_per_mtok DOUBLE PRECISION,
            min_discount_pct TEXT, enabled BOOL, synced_at TIMESTAMPTZ
        )
    """)
    # ── budgets aliases ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS budget_aliases (
            alias TEXT PRIMARY KEY, label TEXT, member_model_ids TEXT, member_count INT,
            min_discount_pct TEXT, official_in_min DOUBLE PRECISION, official_in_max DOUBLE PRECISION,
            official_out_min DOUBLE PRECISION, official_out_max DOUBLE PRECISION,
            upstream_labels TEXT, synced_at TIMESTAMPTZ
        )
    """)
    # ── combos ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS combos (
            id TEXT PRIMARY KEY, name TEXT, slug TEXT, max_input_per_mtok DOUBLE PRECISION,
            max_output_per_mtok DOUBLE PRECISION, created_at TEXT, synced_at TIMESTAMPTZ
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS combo_models (
            combo_id TEXT, model_id TEXT, model TEXT, label TEXT,
            PRIMARY KEY (combo_id, model_id)
        )
    """)

    # ── pricing config (cache) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pricing_config (
            id INT PRIMARY KEY, max_ask_pct DOUBLE PRECISION, platform_fee_pct DOUBLE PRECISION,
            publisher_share_pct INT, synced_at TIMESTAMPTZ
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS auto_pricing_config (
            id SERIAL PRIMARY KEY,
            upstream TEXT NOT NULL,
            model_id TEXT NOT NULL,
            trigger_pct DOUBLE PRECISION NOT NULL,
            rebound_pct DOUBLE PRECISION NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE(upstream, model_id)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS refunds (
            id TEXT PRIMARY KEY,
            upstream TEXT,
            qty INT DEFAULT 0,
            amount_idr DOUBLE PRECISION DEFAULT 0,
            amount_usdc DOUBLE PRECISION DEFAULT 0,
            label TEXT,
            date DATE,
            synced_at TIMESTAMPTZ DEFAULT now()
        )
    """)

    # ── schema sync (full_sync init_db — R11: harus ada di kedua path) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS providers (
            id TEXT PRIMARY KEY, display_name TEXT, upstream_slug TEXT, upstream_label TEXT,
            enabled BOOL, status TEXT, drained BOOL, used_pct DOUBLE PRECISION,
            reset_at TEXT, earnings_lifetime DOUBLE PRECISION, model_count INT, synced_at TIMESTAMPTZ
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_prov_upstream ON providers(upstream_slug)")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS provider_asks (
            id BIGSERIAL PRIMARY KEY, provider_id TEXT, model TEXT, model_status TEXT,
            ask_in DOUBLE PRECISION, ask_out DOUBLE PRECISION, avg_price_in DOUBLE PRECISION,
            avg_price_out DOUBLE PRECISION, avg_price_requests BIGINT, official_in DOUBLE PRECISION,
            official_out DOUBLE PRECISION, enabled BOOL, synced_at TIMESTAMPTZ
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_asks_model ON provider_asks(model)")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS usage_logs (
            id TEXT PRIMARY KEY, ts TIMESTAMPTZ, model TEXT, upstream TEXT, status TEXT,
            prompt_tokens BIGINT, completion_tokens BIGINT, cost_consumer DOUBLE PRECISION,
            cost_publisher DOUBLE PRECISION, synced_at TIMESTAMPTZ
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ul_ts ON usage_logs(ts DESC)")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS market_snapshot (
            slug TEXT PRIMARY KEY, family TEXT, min_ask_in DOUBLE PRECISION, max_ask_in DOUBLE PRECISION,
            min_ask_out DOUBLE PRECISION, max_ask_out DOUBLE PRECISION, last_rate DOUBLE PRECISION, synced_at TIMESTAMPTZ
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS catalog_models (
            slug TEXT PRIMARY KEY, family TEXT, label TEXT, status TEXT, synced_at TIMESTAMPTZ
        )
    """)

    # ── auto-pricing ops history (daemon write) — REV13 (2026-08-17) ──
    cur.execute("""
        CREATE TABLE IF NOT EXISTS auto_pricing_ops (
            id BIGSERIAL PRIMARY KEY,
            ts TIMESTAMPTZ NOT NULL DEFAULT now(),
            slug TEXT NOT NULL,
            model_id TEXT NOT NULL,
            action TEXT NOT NULL,
            our DOUBLE PRECISION NOT NULL,
            target DOUBLE PRECISION NOT NULL,
            ref DOUBLE PRECISION,
            boundary DOUBLE PRECISION,
            official DOUBLE PRECISION NOT NULL,
            trigger_pct DOUBLE PRECISION NOT NULL,
            max_in DOUBLE PRECISION,
            http_status INT,
            dry_run BOOL NOT NULL DEFAULT FALSE,
            reason TEXT
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ap_ops_ts ON auto_pricing_ops(ts DESC)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ap_ops_model ON auto_pricing_ops(slug, model_id, ts DESC)")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS auto_pricing_state (
            slug TEXT NOT NULL,
            model_id TEXT NOT NULL,
            catalog_id TEXT,
            ask_in DOUBLE PRECISION,
            ask_out DOUBLE PRECISION,
            official DOUBLE PRECISION,
            max_ask_in DOUBLE PRECISION,
            enabled BOOL,
            demand DOUBLE PRECISION,
            competitor_price DOUBLE PRECISION,
            action TEXT,
            target DOUBLE PRECISION,
            comp DOUBLE PRECISION,
            reason TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (slug, model_id)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS auto_pricing_api_log (
            id BIGSERIAL PRIMARY KEY,
            ts TIMESTAMPTZ NOT NULL DEFAULT now(),
            endpoint TEXT NOT NULL,
            method TEXT NOT NULL DEFAULT 'GET',
            status INT NOT NULL,
            ms BIGINT NOT NULL,
            bytes INT NOT NULL
        )
    """)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_ap_api_ts ON auto_pricing_api_log(ts DESC)")
