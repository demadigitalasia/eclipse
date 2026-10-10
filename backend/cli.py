"""Operator commands for the ECLIPSE backend."""
import argparse
import json
from getpass import getpass
import os

from backend import db, media, storage
from backend.config import SETTINGS


def create_admin() -> int:
    name = input("Nama admin: ").strip()
    email = input("Email admin: ").strip().lower()
    password = getpass("Sandi admin (min. 12 karakter): ")
    confirm = getpass("Ulangi sandi: ")
    if not name or not email or len(password) < 12 or password != confirm:
        print("Nama/email wajib diisi; sandi harus minimal 12 karakter dan cocok.")
        return 2

    db.init_db(SETTINGS.db_path)
    conn = db.get_conn(SETTINGS.db_path)
    try:
        conn.execute("BEGIN IMMEDIATE")
        if db.count_accounts(conn) != 0:
            conn.rollback()
            print("Database sudah berisi akun. Bootstrap admin hanya dapat dipakai pada database kosong.")
            return 1
        db.create_account(conn, name, email, db.hash_password(password), "admin")
        print(f"Admin {email} berhasil dibuat.")
        return 0
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def migrate_media_to_r2() -> int:
    if not storage.is_r2_enabled():
        print("Atur ECLIPSE_STORAGE_BACKEND=r2 dan kredensial R2 sebelum migrasi.")
        return 2
    db.init_db(SETTINGS.db_path)
    conn = db.get_conn(SETTINGS.db_path)
    try:
        jobs = conn.execute("SELECT * FROM jobs WHERE kind = 'media' ORDER BY created_at").fetchall()
        rows = [db.row_to_dict(row) for row in jobs]
    finally:
        conn.close()
    migrated, skipped, failed = 0, 0, 0
    for job in rows:
        try:
            result = json.loads(job.get("result_json") or "{}")
            source_path = result.get("path") or ""
            if source_path and os.path.isfile(source_path):
                source_key = storage.object_key(job["id"], "source", os.path.basename(source_path))
                storage.store_file(source_path, source_key)
                result["source_object_key"] = source_key
                conn = db.get_conn(SETTINGS.db_path)
                try:
                    db.update_job(conn, job["id"], result_json=json.dumps(result))
                finally:
                    conn.close()
                migrated += 1
            else:
                skipped += 1

            job_path = media.job_dir(SETTINGS.data_dir, job["id"])
            if not os.path.isdir(job_path):
                continue
            source_name = os.path.basename(source_path) if source_path else ""
            for name in os.listdir(job_path):
                path = os.path.join(job_path, name)
                if not os.path.isfile(path) or name == source_name:
                    continue
                if name.startswith("studio_"):
                    category = "studio"
                elif name.lower().endswith(".mp4"):
                    category = "renders"
                else:
                    continue
                storage.store_file(path, storage.object_key(job["id"], category, name))
                migrated += 1
        except Exception as exc:
            failed += 1
            print(f"Gagal migrasi job {job['id']}: {exc}")
    print(f"Migrasi media selesai: {migrated} file diunggah, {skipped} sumber dilewati, {failed} job gagal.")
    return 1 if failed else 0


def check_r2() -> int:
    try:
        storage.check_connection()
    except storage.StorageError as exc:
        print(str(exc))
        return 1
    print(f"Koneksi R2 berhasil untuk bucket yang dikonfigurasi (prefix: {SETTINGS.r2_prefix}).")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m backend.cli")
    parser.add_argument("command", choices=["create-admin", "migrate-media-to-r2", "check-r2"])
    args = parser.parse_args()
    if args.command == "create-admin":
        return create_admin()
    if args.command == "migrate-media-to-r2":
        return migrate_media_to_r2()
    if args.command == "check-r2":
        return check_r2()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
