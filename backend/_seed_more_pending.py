"""One-shot script that drops 12 additional photos into the
`steps.pending_photos` queue across existing in-progress commissions so the
Media Approvals screen has plenty of items to review during demos.

Run from the backend container:
    cd /app/backend && python _seed_more_pending.py
"""
import asyncio
import os
import random
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "test_database")

# Use Picsum placeholder images — high-quality, varied, free, public.
# A stable `seed=` slug guarantees the same image every time the script
# runs so we don't burn through Cloudinary uploads, and `1200x1200` keeps
# the moderation grid thumbnails sharp on retina screens.
PICSUM = "https://picsum.photos/seed/{slug}/1200/1200"
SAMPLE_SLUGS = [
    "atelier-bench-01", "loupe-grading-02", "wax-carving-03",
    "casting-flask-04", "tumble-polish-05", "stone-setting-06",
    "diamond-pave-07", "rhodium-bath-08", "qc-microscope-09",
    "buffing-wheel-10", "final-rinse-11", "presentation-12",
]


async def main() -> int:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # Pull every in-progress, non-deleted commission so we have a healthy
    # pool of candidate (order, step) targets to spread the new photos
    # across — moderation looks more believable when items come from
    # different orders rather than 12 photos on a single step.
    orders = await db.orders.find(
        {
            "$or": [
                {"deleted_at": {"$exists": False}},
                {"deleted_at": None},
            ],
            "completed_at": None,
        },
        {"_id": 0, "id": 1, "order_ref": 1, "steps": 1},
    ).to_list(None)

    if not orders:
        print("No active orders found; cannot seed.")
        return 1

    # Build candidate slots: (order_id, step_number, step_title) for steps
    # that are NOT yet completed (so the pending queue is realistic — a
    # manufacturer wouldn't upload to an already-completed step).
    slots: list[tuple[str, str, int, str]] = []
    for o in orders:
        for s in o.get("steps") or []:
            if s.get("completed"):
                continue
            slots.append(
                (o["id"], o.get("order_ref") or "?", s["step_number"], s.get("title") or "")
            )

    if not slots:
        print("No incomplete steps available across active orders.")
        return 1

    random.seed(42)
    random.shuffle(slots)
    target_slots = slots[:12]
    print(f"Seeding 12 photos across {len({s[0] for s in target_slots})} commissions.")

    now_iso = datetime.now(timezone.utc).isoformat()
    added = 0
    for (order_id, order_ref, step_number, step_title), slug in zip(
        target_slots, SAMPLE_SLUGS
    ):
        photo_url = PICSUM.format(slug=slug)
        # Idempotency — skip if this exact URL already exists in the
        # pending bucket for this step. (Same script can be safely run
        # multiple times without duplicating.)
        existing = await db.orders.find_one(
            {
                "id": order_id,
                "steps": {
                    "$elemMatch": {
                        "step_number": step_number,
                        "pending_photos": photo_url,
                    }
                },
            }
        )
        if existing:
            print(f"  · {order_ref} step {step_number:02d} already has {slug} — skip")
            continue

        # $push the URL onto the matching step's pending_photos array.
        result = await db.orders.update_one(
            {"id": order_id, "steps.step_number": step_number},
            {
                "$push": {"steps.$.pending_photos": photo_url},
                "$set": {
                    "steps.$.last_pending_upload_at": now_iso,
                },
            },
        )
        if result.modified_count:
            added += 1
            print(
                f"  ✓ {order_ref} step {step_number:02d} ({step_title[:32]}) "
                f"← {slug}"
            )
        else:
            print(f"  ✗ Failed to push to {order_ref} step {step_number:02d}")

    print(f"\nDone — {added}/12 photos seeded into the pending queue.")
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
