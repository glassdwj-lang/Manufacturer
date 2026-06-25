"""The canonical 26-step Somnio.Co Atelier manufacturing journey."""
from __future__ import annotations

PHASES = [
    {
        "phase": "I",
        "title": "Origins & Design",
        "steps": [
            (1, "Designer Identification", "Recording the lead artisan/designer responsible for the style."),
            (2, "Conceptual Rendering", "Digital and hand-sketched blueprints."),
            (3, "Metal Sourcing", "Verification of top-grade, hypoallergenic metals (Platinum/18k/14k)."),
            (4, "Conflict-Free Diamond Sourcing", "Tracking stones through IGI for lab diamonds."),
            (5, "Gemstone Authentication", "Sourcing and vetting of colored stones by onsite gemologists."),
        ],
    },
    {
        "phase": "II",
        "title": "The Master Craft",
        "steps": [
            (6, "CAD Modeling", "3D digital precision mapping."),
            (7, "Master Wax Carving", "Creating the high-fidelity mold."),
            (8, "Casting", "The 'Lost Wax' process to form the metal structure."),
            (9, "Clean-up & Fabrication", "Hand-filing and structural reinforcement."),
            (10, "Laser Inscription", "Permanent engraving of the unique serial number."),
            (11, "Pre-Polishing", "Smoothing the metal before stones are set."),
            (12, "Stone Matching", "Hand-selecting stones for exact color and clarity consistency."),
            (13, "Precision Setting", "Hand-setting stones under 40x magnification."),
            (14, "Micro-Pavé Inspection", "Ensuring every secondary stone is secure."),
            (15, "Assembly", "Joining individual components (e.g., the head to the shank)."),
        ],
    },
    {
        "phase": "III",
        "title": "The Finishing Touch",
        "steps": [
            (16, "Multi-Stage Polishing", "A series of hand-buffing cycles."),
            (17, "Ultrasonic Cleaning", "Removing microscopic debris from the setting."),
            (18, "Rhodium Plating", "(For white gold) High-luster, white finish."),
            (19, 'The "Mirror" Finish', "The final hand-polish for maximum light return."),
            (20, "Hallmark Verification", "Stamping the metal purity and brand trademark."),
        ],
    },
    {
        "phase": "IV",
        "title": "Quality Control Vault",
        "steps": [
            (21, "Structural Integrity Test", "Checking prong tension and stone security."),
            (22, "Dimension Accuracy", "Confirming exact ring size and proportions."),
            (23, "Final Aesthetic Clearance", "Master jeweler review of the finished piece."),
        ],
    },
    {
        "phase": "V",
        "title": "Logistics & Ownership",
        "steps": [
            (24, "Shipment Tracking", "Secure transit logs from facility to partner jeweler."),
            (25, "Authorized Associate Receipt", "Verification of arrival and final local inspection."),
            (26, "Customer Registry", "Warranty and ownership are locked into the global database."),
        ],
    },
]


def build_initial_steps() -> list[dict]:
    """Build the embedded step list for a new order."""
    steps: list[dict] = []
    for phase in PHASES:
        for num, title, desc in phase["steps"]:
            steps.append(
                {
                    "step_number": num,
                    "title": title,
                    "description": desc,
                    "phase": phase["phase"],
                    "phase_title": phase["title"],
                    "completed": False,
                    "completed_at_china": None,
                    "completed_at_utc": None,
                    "notes": "",
                    "notes_translated": "",
                    "notes_target_lang": "",
                    "photos": [],
                    "forwarded_to_client": False,
                    "forwarded_at": None,
                    "associate_review_note": "",
                    "associate_review_note_translated": "",
                }
            )
    return steps
