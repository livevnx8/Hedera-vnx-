"""
Learning Lane API — FastAPI routes for proof loop tracking, lesson extraction,
and upgrade package management.

Endpoints:
  GET  /api/vera/learning/loops          — list proof loops (open/closed)
  GET  /api/vera/learning/loops/{id}     — single loop with evidence
  GET  /api/vera/workflows/evidence      — open/closed/failing loop summary
  POST /api/vera/learning/extract        — extract lesson from closed loop
  GET  /api/vera/learning/lessons        — list lessons
  POST /api/vera/learning/lessons/{id}/approve — operator approve
  GET  /api/vera/learning/packages       — list upgrade packages
  POST /api/vera/learning/packages/build — build package from lessons
  POST /api/vera/learning/packages/{id}/publish — publish to HCS
  GET  /api/vera/learning/stats          — full learning lane stats
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from .proof_loop_tracker import ProofLoopTracker, LoopStage
from .lesson_engine import LessonEngine
from .upgrade_packages import UpgradePackageBuilder


def create_learning_router(
    tracker: ProofLoopTracker,
    lesson_engine: LessonEngine,
    package_builder: UpgradePackageBuilder,
) -> APIRouter:
    router = APIRouter(prefix="/api/vera/learning", tags=["learning"])

    # ── Proof Loops ────────────────────────────────────────────

    @router.get("/loops")
    async def list_loops(
        status: Optional[str] = Query(None),
        limit: int = Query(20, ge=1, le=200),
    ):
        loops = tracker.list_loops(status=status, limit=limit)
        return {
            "loops": [l.to_dict() for l in loops],
            "total": len(loops),
        }

    @router.get("/loops/{loop_id}")
    async def get_loop(loop_id: str):
        loop = tracker.get_loop_by_id(loop_id)
        if not loop:
            raise HTTPException(404, f"Loop {loop_id} not found")
        return {
            **loop.to_dict(),
            "evidence": [e.to_dict() for e in loop.evidence],
        }

    # ── Workflows Evidence (Elliptical Proof) ──────────────────

    @router.get("/workflows/evidence")
    async def workflows_evidence():
        """Summary of proof loop states for the elliptical workflow dashboard."""
        return {
            "open_loops": len(tracker.open_loops(limit=9999)),
            "closed_loops": len(tracker.closed_loops(limit=9999)),
            "recent_closed": [l.to_dict() for l in tracker.closed_loops(limit=5)],
            "recent_open": [l.to_dict() for l in tracker.open_loops(limit=5)],
            "stats": tracker.stats(),
        }

    # ── Lesson Extraction ──────────────────────────────────────

    @router.post("/extract")
    async def extract_lesson(body: dict):
        """
        Extract a lesson from a closed proof loop.
        Body: { "task_id": "...", "domain": "...", "task_types": [...] }
        """
        task_id = body.get("task_id", "")
        loop = tracker.get_loop(task_id)
        if not loop:
            raise HTTPException(404, f"No proof loop found for task {task_id}")

        context = {
            "domain": body.get("domain", "general"),
            "task_types": body.get("task_types", []),
            "additional_actions": body.get("additional_actions", []),
        }

        try:
            lesson = lesson_engine.extract(loop, context)
            tracker.mark_lesson(task_id, lesson.lesson_id)
            return lesson.to_dict()
        except ValueError as e:
            raise HTTPException(400, str(e))

    @router.get("/lessons")
    async def list_lessons(
        domain: Optional[str] = Query(None),
        approved: bool = Query(False),
        limit: int = Query(20, ge=1, le=200),
    ):
        lessons = lesson_engine.list_lessons(domain=domain, approved_only=approved, limit=limit)
        return {
            "lessons": [l.to_dict() for l in lessons],
            "total": len(lessons),
        }

    @router.get("/lessons/{lesson_id}")
    async def get_lesson(lesson_id: str):
        lesson = lesson_engine.get(lesson_id)
        if not lesson:
            raise HTTPException(404, f"Lesson {lesson_id} not found")
        return lesson.to_dict()

    @router.post("/lessons/{lesson_id}/approve")
    async def approve_lesson(lesson_id: str):
        try:
            lesson = lesson_engine.approve(lesson_id)
            return {"status": "approved", "lesson_id": lesson.lesson_id, "approved_at": lesson.approved_at}
        except KeyError as e:
            raise HTTPException(404, str(e))

    # ── Upgrade Packages ───────────────────────────────────────

    @router.get("/packages")
    async def list_packages(
        domain: Optional[str] = Query(None),
        published: bool = Query(False),
        limit: int = Query(20, ge=1, le=200),
    ):
        packages = package_builder.list_packages(domain=domain, published_only=published, limit=limit)
        return {
            "packages": [p.to_dict() for p in packages],
            "total": len(packages),
        }

    @router.post("/packages/build")
    async def build_package(body: dict):
        """
        Build an upgrade package from approved lessons.
        Body: { "name": "...", "domain": "...", "lesson_ids": [...], "description": "...", "capabilities": [...] }
        """
        name = body.get("name", "")
        domain = body.get("domain", "general")
        lesson_ids = body.get("lesson_ids", [])
        description = body.get("description", "")
        capabilities = body.get("capabilities")

        if not name:
            raise HTTPException(400, "Package name required")
        if not lesson_ids:
            raise HTTPException(400, "At least one lesson_id required")

        lessons = []
        for lid in lesson_ids:
            lesson = lesson_engine.get(lid)
            if not lesson:
                raise HTTPException(404, f"Lesson {lid} not found")
            lessons.append(lesson)

        try:
            package = package_builder.build(
                name=name,
                domain=domain,
                lessons=lessons,
                description=description,
                capabilities=capabilities,
            )
            return package.to_dict()
        except ValueError as e:
            raise HTTPException(400, str(e))

    @router.get("/packages/{package_id}")
    async def get_package(package_id: str):
        package = package_builder.get(package_id)
        if not package:
            raise HTTPException(404, f"Package {package_id} not found")
        return package.to_dict()

    @router.post("/packages/{package_id}/publish")
    async def publish_package(package_id: str):
        try:
            package = package_builder.publish(package_id)
            return {
                "status": "published",
                "package_id": package.package_id,
                "hcs_topic_id": package.hcs_topic_id,
                "hcs_sequence": package.hcs_sequence,
                "published_at": package.published_at,
            }
        except KeyError as e:
            raise HTTPException(404, str(e))

    # ── Stats ──────────────────────────────────────────────────

    @router.get("/stats")
    async def learning_stats():
        return {
            "loops": tracker.stats(),
            "lessons": lesson_engine.stats(),
            "packages": package_builder.stats(),
        }

    return router
