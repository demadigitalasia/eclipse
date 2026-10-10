"""Persistent, account-scoped in-app notifications."""
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from backend import auth, db
from backend.config import SETTINGS, subscription_defaults

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def my_notifications(user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        db.expire_unpaid_subscription_payments(conn)
        db.backfill_payment_notifications(conn)
        settings = db.get_subscription_settings(conn, subscription_defaults())
        account = db.find_account_by_id(conn, user["id"])
        if account:
            db.sync_subscription_notifications(conn, account, settings)
        return {
            "notifications": db.list_notifications(conn, user["id"]),
            "unreadCount": db.unread_notification_count(conn, user["id"]),
        }
    finally:
        conn.close()


@router.patch("/{notification_id}/read")
def read_notification(notification_id: str, user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        changed = db.mark_notification_read(conn, user["id"], notification_id)
        return {"ok": True, "changed": changed}
    finally:
        conn.close()


@router.post("/read-all")
def read_all_notifications(user=Depends(auth.depends_user)):
    if isinstance(user, JSONResponse):
        return user
    conn = db.get_conn(SETTINGS.db_path)
    try:
        changed = db.mark_notification_read(conn, user["id"])
        return {"ok": True, "changed": changed}
    finally:
        conn.close()
