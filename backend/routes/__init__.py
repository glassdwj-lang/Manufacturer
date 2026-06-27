"""Route packages — one APIRouter per domain concern.

Each module exposes a `router: APIRouter` that `server.py` mounts under /api.
"""
from .auth import router as auth_router
from .users import router as users_router
from .orders import router as orders_router
from .admin import router as admin_router
from .admin_dashboard import router as admin_dashboard_router
from .meta import router as meta_router
from .uploads import router as uploads_router
from .approvals import router as approvals_router
from .notifications import router as notifications_router

__all__ = [
    "auth_router",
    "users_router",
    "orders_router",
    "admin_router",
    "admin_dashboard_router",
    "meta_router",
    "uploads_router",
    "approvals_router",
    "notifications_router",
]
