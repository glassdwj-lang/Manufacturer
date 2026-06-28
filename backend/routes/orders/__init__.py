"""Order routes package — mounts every domain sub-router on a single
``APIRouter`` exposed as ``router`` so the existing
``server.py`` import (``from routes import orders_router``) keeps
working unchanged.

Layout:
* ``_shared.py``    — shared imports + helpers (sanitize_recipients,
                       customs_kind_field, FileEmailPayload).
* ``crud.py``        — create / list / get / soft-delete + recycle-bin.
* ``steps.py``       — per-step complete / update / reopen / translate.
* ``customs.py``     — customs sub-document + multi-file + email.
* ``cad.py``         — CAD files CRUD + email.
* ``igi.py``         — IGI certificates CRUD + email.
* ``digital_dna.py`` — Digital DNA PDF endpoint.

Adding a new endpoint? Pick the file whose domain it belongs to (or
create a new module + include it below). Nothing else needs to change.
"""
from fastapi import APIRouter

from .crud import router as _crud_router
from .steps import router as _steps_router
from .customs import router as _customs_router
from .cad import router as _cad_router
from .igi import router as _igi_router
from .renders import router as _renders_router
from .digital_dna import router as _digital_dna_router
from .client_approval import router as _client_approval_router

router = APIRouter()
router.include_router(_crud_router)
router.include_router(_steps_router)
router.include_router(_customs_router)
router.include_router(_cad_router)
router.include_router(_igi_router)
router.include_router(_renders_router)
router.include_router(_digital_dna_router)
router.include_router(_client_approval_router)

__all__ = ["router"]
