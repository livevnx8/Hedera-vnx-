"""
AI Backbone API — endpoints for task decomposition, summarization, and RAG Q&A.
"""

from typing import Any, Dict

from fastapi import APIRouter, HTTPException

from .llm_router import LLMRouter
from .task_decomposer import TaskDecomposer
from .summarizer import ResultSummarizer
from .rag_context import RAGContext


def create_ai_router(
    llm_router: LLMRouter,
    decomposer: TaskDecomposer,
    summarizer: ResultSummarizer,
    rag: RAGContext,
) -> APIRouter:
    router = APIRouter(prefix="/ai", tags=["ai"])

    @router.post("/decompose")
    async def decompose_task(body: Dict[str, Any]) -> Dict[str, Any]:
        """Decompose a natural language task into agent pipeline steps."""
        description = body.get("description", "")
        if not description:
            raise HTTPException(400, "description is required")
        context = body.get("context", {})
        result = decomposer.decompose(description, context)
        return result

    @router.post("/summarize")
    async def summarize_results(body: Dict[str, Any]) -> Dict[str, Any]:
        """Summarize agent/pipeline results into natural language."""
        results = body.get("results", {})
        context = body.get("context", "")
        if not results:
            raise HTTPException(400, "results is required")
        return summarizer.summarize(results, context)

    @router.post("/ask")
    async def ask_question(body: Dict[str, Any]) -> Dict[str, Any]:
        """RAG-powered Q&A over system state and history."""
        question = body.get("question", "")
        if not question:
            raise HTTPException(400, "question is required")
        category = body.get("category")
        return rag.ask(question, category=category)

    @router.get("/models")
    async def list_models() -> Dict[str, Any]:
        """List available LLM models and their status."""
        return llm_router.stats()

    @router.post("/complete")
    async def raw_completion(body: Dict[str, Any]) -> Dict[str, Any]:
        """Raw LLM completion (for advanced use)."""
        prompt = body.get("prompt", "")
        if not prompt:
            raise HTTPException(400, "prompt is required")
        response = llm_router.complete(
            prompt=prompt,
            system_prompt=body.get("system_prompt", ""),
            model=body.get("model"),
            max_tokens=body.get("max_tokens", 500),
            temperature=body.get("temperature", 0.7),
        )
        return response.to_dict()

    @router.get("/stats")
    async def ai_stats() -> Dict[str, Any]:
        return {
            "llm": llm_router.stats(),
            "rag": rag.stats(),
            "decompositions": len(decomposer.history()),
            "summaries": len(summarizer.history()),
        }

    return router
