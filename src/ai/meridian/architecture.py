"""
Meridian Ternary Transformer Architecture

BitNet-style {-1, 0, 1} weight transformer for CPU-efficient inference.
Designed to evaluate ternary weights on Vera's agent coordination workload.

Key design:
- Weights stored as ternary {-1, 0, 1} via straight-through estimator
- Activations remain bf16/fp16 for stability
- LayerNorm, embeddings, output head stay full-precision
- Matmul decomposes to: sign-flip + accumulation (no floating-point multiply)
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch import Tensor


# ─── Configuration ──────────────────────────────────────────────────────────

@dataclass
class MeridianConfig:
    vocab_size: int = 32000          # BPE vocabulary
    d_model: int = 768               # embedding / hidden dimension
    n_layers: int = 12               # transformer layers
    n_heads: int = 12                # attention heads
    d_head: int = 64                 # per-head dimension (d_model // n_heads)
    max_seq_len: int = 2048          # context window
    dropout: float = 0.0             # ternary models are small; dropout usually 0
    use_ternary: bool = True         # False = baseline fp16 for comparison
    ternary_init_scale: float = 0.01  # small init for STE stability
    intermediate_ratio: float = 2.67  # SwiGLU hidden = 2.67 * d_model (approx 2048)
    rms_norm_eps: float = 1e-6
    rope_theta: float = 10000.0      # RoPE base frequency
    gradient_checkpointing: bool = False  # Enable for large models


# ─── Ternary Quantization ─────────────────────────────────────────────────

def ternarize(w: Tensor) -> Tensor:
    """
    Forward: quantize weights to {-1, 0, 1}.
    Backward: straight-through estimator (gradient passes to full-precision shadow).
    """
    # Forward: hard ternarization
    ternary = torch.zeros_like(w)
    ternary[w > 0] = 1.0
    ternary[w < 0] = -1.0
    # Backward: STE — gradient flows to original w
    return w + (ternary - w).detach()


class TernaryLinear(nn.Module):
    """
    Linear layer with ternary weights.

    Stores full-precision shadow weights for training (STE).
    At inference, weights are pure {-1, 0, 1} — matmul is add/subtract/accumulate.
    """

    def __init__(self, in_features: int, out_features: int, bias: bool = False):
        super().__init__()
        self.in_features = in_features
        self.out_features = out_features
        # Shadow weights (trained via STE)
        self.weight = nn.Parameter(torch.zeros(out_features, in_features))
        if bias:
            self.bias = nn.Parameter(torch.zeros(out_features))
        else:
            self.register_parameter("bias", None)
        self.reset_parameters()

    def reset_parameters(self):
        nn.init.uniform_(self.weight, -0.01, 0.01)

    def forward(self, x: Tensor) -> Tensor:
        w = ternarize(self.weight)
        return F.linear(x, w, self.bias)

    def extra_repr(self) -> str:
        return f"in_features={self.in_features}, out_features={self.out_features}, bias={self.bias is not None}, ternary"


# ─── RMSNorm ────────────────────────────────────────────────────────────────

class RMSNorm(nn.Module):
    def __init__(self, dim: int, eps: float = 1e-6):
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim))

    def forward(self, x: Tensor) -> Tensor:
        return x * torch.rsqrt(x.pow(2).mean(-1, keepdim=True) + self.eps) * self.weight


# ─── RoPE (Rotary Position Embedding) ─────────────────────────────────────

def precompute_rope_freqs(dim: int, max_seq_len: int, theta: float = 10000.0) -> Tuple[Tensor, Tensor]:
    """Precompute sin/cos for RoPE."""
    freqs = 1.0 / (theta ** (torch.arange(0, dim, 2).float() / dim))
    t = torch.arange(max_seq_len, dtype=torch.float32)
    freqs = torch.outer(t, freqs)  # [max_seq_len, dim//2]
    return torch.cos(freqs), torch.sin(freqs)


def apply_rope(x: Tensor, cos: Tensor, sin: Tensor) -> Tensor:
    """
    Apply rotary position embedding.
    x: [B, n_heads, seq_len, d_head]
    """
    # x_split: [B, n_heads, seq_len, d_head//2, 2]
    d = x.shape[-1]
    x1, x2 = x[..., : d // 2], x[..., d // 2 :]
    rotated = torch.stack([-x2, x1], dim=-1).flatten(-2)
    return x * cos + rotated * sin


# ─── Attention ──────────────────────────────────────────────────────────────

class TernaryAttention(nn.Module):
    """Multi-head attention with ternary Q/K/V projections."""

    def __init__(self, config: MeridianConfig):
        super().__init__()
        self.n_heads = config.n_heads
        self.d_head = config.d_head
        self.d_model = config.d_model

        if config.use_ternary:
            self.q_proj = TernaryLinear(config.d_model, config.d_model, bias=False)
            self.k_proj = TernaryLinear(config.d_model, config.d_model, bias=False)
            self.v_proj = TernaryLinear(config.d_model, config.d_model, bias=False)
            self.o_proj = TernaryLinear(config.d_model, config.d_model, bias=False)
        else:
            self.q_proj = nn.Linear(config.d_model, config.d_model, bias=False)
            self.k_proj = nn.Linear(config.d_model, config.d_model, bias=False)
            self.v_proj = nn.Linear(config.d_model, config.d_model, bias=False)
            self.o_proj = nn.Linear(config.d_model, config.d_model, bias=False)

        # Precompute RoPE
        cos, sin = precompute_rope_freqs(config.d_head, config.max_seq_len, config.rope_theta)
        self.register_buffer("rope_cos", cos, persistent=False)
        self.register_buffer("rope_sin", sin, persistent=False)

    def forward(self, x: Tensor, mask: Optional[Tensor] = None) -> Tensor:
        B, T, _ = x.shape

        q = self.q_proj(x).view(B, T, self.n_heads, self.d_head).transpose(1, 2)
        k = self.k_proj(x).view(B, T, self.n_heads, self.d_head).transpose(1, 2)
        v = self.v_proj(x).view(B, T, self.n_heads, self.d_head).transpose(1, 2)

        # Apply RoPE to q, k
        cos = self.rope_cos[:T].view(1, 1, T, self.d_head // 2).repeat(1, 1, 1, 2)
        sin = self.rope_sin[:T].view(1, 1, T, self.d_head // 2).repeat(1, 1, 1, 2)
        q = apply_rope(q, cos, sin)
        k = apply_rope(k, cos, sin)

        # Scaled dot-product attention
        scores = torch.matmul(q, k.transpose(-2, -1)) / math.sqrt(self.d_head)
        if mask is not None:
            scores = scores.masked_fill(mask == 0, float("-inf"))
        attn = F.softmax(scores, dim=-1)
        out = torch.matmul(attn, v)

        out = out.transpose(1, 2).contiguous().view(B, T, self.d_model)
        return self.o_proj(out)


# ─── SwiGLU FFN ─────────────────────────────────────────────────────────────

class TernarySwiGLU(nn.Module):
    """
    SwiGLU feed-forward with ternary weights.
    hidden_dim = intermediate_ratio * d_model (default ~2048 for d_model=768)
    """

    def __init__(self, config: MeridianConfig):
        super().__init__()
        hidden_dim = int(config.intermediate_ratio * config.d_model)
        if config.use_ternary:
            self.gate_proj = TernaryLinear(config.d_model, hidden_dim, bias=False)
            self.up_proj = TernaryLinear(config.d_model, hidden_dim, bias=False)
            self.down_proj = TernaryLinear(hidden_dim, config.d_model, bias=False)
        else:
            self.gate_proj = nn.Linear(config.d_model, hidden_dim, bias=False)
            self.up_proj = nn.Linear(config.d_model, hidden_dim, bias=False)
            self.down_proj = nn.Linear(hidden_dim, config.d_model, bias=False)

    def forward(self, x: Tensor) -> Tensor:
        return self.down_proj(F.silu(self.gate_proj(x)) * self.up_proj(x))


# ─── Transformer Block ──────────────────────────────────────────────────────

class MeridianBlock(nn.Module):
    def __init__(self, config: MeridianConfig):
        super().__init__()
        self.attn_norm = RMSNorm(config.d_model, config.rms_norm_eps)
        self.attn = TernaryAttention(config)
        self.ffn_norm = RMSNorm(config.d_model, config.rms_norm_eps)
        self.ffn = TernarySwiGLU(config)
        self._gradient_checkpointing = config.gradient_checkpointing

    def forward(self, x: Tensor, mask: Optional[Tensor] = None) -> Tensor:
        if self._gradient_checkpointing and self.training:
            x = x + torch.utils.checkpoint.checkpoint(self.attn, self.attn_norm(x), mask, use_reentrant=False)
            x = x + torch.utils.checkpoint.checkpoint(self.ffn, self.ffn_norm(x), use_reentrant=False)
        else:
            x = x + self.attn(self.attn_norm(x), mask)
            x = x + self.ffn(self.ffn_norm(x))
        return x


# ─── Full Model ─────────────────────────────────────────────────────────────

class MeridianModel(nn.Module):
    """Complete ternary transformer for Vera agent tasks."""

    def __init__(self, config: MeridianConfig):
        super().__init__()
        self.config = config
        self.token_embedding = nn.Embedding(config.vocab_size, config.d_model)
        self.layers = nn.ModuleList([MeridianBlock(config) for _ in range(config.n_layers)])
        self.norm = RMSNorm(config.d_model, config.rms_norm_eps)
        self.lm_head = nn.Linear(config.d_model, config.vocab_size, bias=False)
        # Tie weights for parameter efficiency (common in small models)
        self.lm_head.weight = self.token_embedding.weight

        if config.gradient_checkpointing:
            self.enable_gradient_checkpointing()
        self.apply(self._init_weights)

    def enable_gradient_checkpointing(self):
        """Enable gradient checkpointing for memory-efficient training of large models."""
        for block in self.layers:
            block._gradient_checkpointing = True
        print("[Meridian] Gradient checkpointing enabled — training memory reduced ~40%")

    def disable_gradient_checkpointing(self):
        """Disable gradient checkpointing."""
        for block in self.layers:
            block._gradient_checkpointing = False

    def _init_weights(self, module: nn.Module):
        if isinstance(module, nn.Linear):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                torch.nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            torch.nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(self, tokens: Tensor) -> Tensor:
        B, T = tokens.shape
        x = self.token_embedding(tokens)

        # Causal mask
        mask = torch.tril(torch.ones(T, T, device=tokens.device)).view(1, 1, T, T)

        for layer in self.layers:
            x = layer(x, mask)

        x = self.norm(x)
        logits = self.lm_head(x)
        return logits

    def count_parameters(self) -> dict[str, int]:
        """Return parameter counts by category."""
        total = sum(p.numel() for p in self.parameters())
        ternary_param_ids = {
            id(param)
            for module in self.modules()
            if isinstance(module, TernaryLinear)
            for param in module.parameters(recurse=False)
        }
        ternary = sum(p.numel() for p in self.parameters() if id(p) in ternary_param_ids)
        embedding = sum(p.numel() for n, p in self.named_parameters() if "embedding" in n.lower())
        return {
            "total": total,
            "ternary_layers": ternary,
            "embeddings": embedding,
            "non_ternary": total - ternary - embedding,
        }


# ─── Quick sanity check ───────────────────────────────────────────────────

if __name__ == "__main__":
    cfg = MeridianConfig(use_ternary=True)
    model = MeridianModel(cfg)
    counts = model.count_parameters()
    print(f"Meridian model parameters: {counts}")
    print(f"Approx size: {counts['total'] / 1e6:.2f}M params")

    # Forward test
    dummy = torch.randint(0, cfg.vocab_size, (2, 10))
    out = model(dummy)
    print(f"Output shape: {out.shape}")  # [2, 10, vocab_size]
    print("Architecture verified.")
