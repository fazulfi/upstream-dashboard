"""Helper audit trail finansial — semua mutasi keuangan dicatat."""
import json


def audit_write(conn, entity, entity_id, action, actor, source, before=None, after=None):
    """Tulis satu baris audit dalam transaksi koneksi pemanggil."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO financial_audit (entity, entity_id, action, actor, source, before, after)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (entity, entity_id, action, actor, source,
             json.dumps(before) if before is not None else None,
             json.dumps(after) if after is not None else None),
        )
