"""Route packages — one APIRouter per domain concern.

Each module exposes a `router: APIRouter` that `server.py` mounts under /api.
"""
from .auth import router as auth_router
from .users import router as users_router
from .orders import router as orders_router
from .admin_core import router as admin_core_router
from .admin_seed import router as admin_seed_router
from .admin_cross_order import router as admin_cross_order_router
from .admin_dashboard import router as admin_dashboard_router
from .meta import router as meta_router
from .uploads import router as uploads_router
from .approvals import router as approvals_router
from .notifications import router as notifications_router
from .manufacturers import router as manufacturers_router
from .quotes import router as quotes_router
from .rfqs import router as rfqs_router
from .fx import router as fx_router
from .competitors import router as competitors_router

# Backwards-compatible alias — server.py and a few legacy imports still
# reference `admin_router` from when admin endpoints lived in a single
# monolithic module. Pointing it at admin_core keeps those callers working.
admin_router = admin_core_router

__all__ = [
    "auth_router",
    "users_router",
    "orders_router",
    "admin_router",
    "admin_core_router",
    "admin_seed_router",
    "admin_cross_order_router",
    "admin_dashboard_router",
    "meta_router",
    "uploads_router",
    "approvals_router",
    "notifications_router",
    "manufacturers_router",
    "quotes_router",
    "rfqs_router",
    "fx_router",
    "competitors_router",
]
