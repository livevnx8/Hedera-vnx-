"""Public facade for the AI Backbone."""

from typing import Any, Dict, Optional


class IntelligenceService:
    """
    High-level facade for VNX AI Backbone.

    Provides LLM routing, task decomposition, summarization, and RAG Q&A.
    """

    def __init__(self):
        from src.ai_backbone import LLMRouter, TaskDecomposer, ResultSummarizer, RAGContext

        self.llm = LLMRouter()
        self.decomposer = TaskDecomposer(self.llm)
        self.summarizer = ResultSummarizer(self.llm)
        self.rag = RAGContext(self.llm)

    def decompose(self, task_description: str) -> Dict[str, Any]:
        """Decompose a natural language task into agent pipeline steps."""
        return self.decomposer.decompose(task_description)

    def summarize(self, results: Dict[str, Any], context: str = "") -> Dict[str, Any]:
        """Summarize agent results into natural language."""
        return self.summarizer.summarize(results, context)

    def ask(self, question: str) -> Dict[str, Any]:
        """RAG-powered Q&A over system state."""
        return self.rag.ask(question)

    def complete(self, prompt: str, **kwargs) -> str:
        """Raw LLM completion."""
        response = self.llm.complete(prompt, **kwargs)
        return response.text

    def stats(self) -> Dict[str, Any]:
        return {
            "llm": self.llm.stats(),
            "rag": self.rag.stats(),
        }
