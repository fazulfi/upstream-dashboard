"""Mutation Guard — satu abstraksi utk semua kontrol mutasi (Phase 4 C3).

Alur: validasi Idempotency-Key → cek replay table → eksekusi executor →
tulis financial_audit → commit. Error → rollback + MutationGuardError.
"""
import hashlib
import json

from financial_audit import audit_write


class MutationGuardError(Exception):
    def __init__(self, message, status_code=400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


_REPLAY_TABLE = "mutation_replay"


def _request_hash(request_body):
    return hashlib.sha256(
        json.dumps(request_body, sort_keys=True, default=str).encode()
    ).hexdigest()


def guard_mutation(request, conn, audit_entity, audit_action, executor,
                   idempotency_key=None, actor="unknown", source="dashboard",
                   request_body=None, rollback_hook=None, actor_role="operator",
                   required_roles=None):
    """Jalankan satu mutasi dengan guard. Returns (status, payload)."""
    if not idempotency_key:
        raise MutationGuardError("Idempotency-Key header wajib utk request mutasi", 400)

    # P4-Q4/Q13: otorisasi berbasis role — tolak SEBELUM eksekusi bila role
    # aktor tidak termasuk required_roles (default None = semua role boleh).
    if required_roles and actor_role not in required_roles:
        raise MutationGuardError(
            "role '%s' tidak berhak menjalankan %s (butuh %s)"
            % (actor_role, audit_action, "/".join(required_roles)), 403)

    body_hash = _request_hash(request_body or {})
    with conn.cursor() as cur:
        cur.execute(
            "SELECT response_json FROM %s WHERE key=%%s AND route=%%s" % (_REPLAY_TABLE,),
            (idempotency_key, audit_action))
        row = cur.fetchone()
        if row:
            # replay — jangan re-execute; unpack tuple (status, payload) supaya
            # return shape konsisten dgn jalur execute: (status, payload)
            replayed = json.loads(row["response_json"])
            return replayed["status"], replayed["payload"]

        try:
            status, payload = executor()
            audit_write(conn, audit_entity, None, audit_action, actor, source,
                        before=request_body, after=payload)
            cur.execute(
                "INSERT INTO %s (key, route, request_hash, response_json, created_at)"
                " VALUES (%%s, %%s, %%s, %%s, now())" % (_REPLAY_TABLE,),
                (idempotency_key, audit_action, body_hash, json.dumps({"status": status, "payload": payload})))
            conn.commit()
            return status, payload
        except Exception:
            if rollback_hook:
                rollback_hook()
            conn.rollback()
            raise
