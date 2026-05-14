#!/usr/bin/env python3
"""
Generate comprehensive report with PNG/SVG visualizations of key findings, bottlenecks, and potential
"""

import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from pathlib import Path

# Set style
plt.style.use('seaborn-v0_8-darkgrid')

# Create output directory
output_dir = Path("report_visualizations")
output_dir.mkdir(exist_ok=True)

# Data from training runs
runs = {
    'Synthetic-only (with quantization)': {'accuracy': 0.0, 'loss': 2.30, 'status': 'Failed'},
    'Synthetic-only (no quantization)': {'accuracy': 0.34, 'loss': 1.10, 'status': 'Success'},
    'Linear Baseline': {'accuracy': 0.33, 'loss': 1.10, 'status': 'Success'},
    'Mixed Corpus (100 real + 9000 synthetic)': {'accuracy': 0.455, 'loss': 0.85, 'status': 'Success'}
}

# Figure 1: Accuracy Comparison
fig, ax = plt.subplots(figsize=(12, 7))
accuracies = [runs[k]['accuracy'] * 100 for k in runs.keys()]
colors = ['red' if runs[k]['status'] == 'Failed' else 'green' for k in runs.keys()]
bars = ax.bar(range(len(runs)), accuracies, color=colors, alpha=0.7, edgecolor='black', linewidth=2)
ax.set_xticks(range(len(runs)))
ax.set_xticklabels([k.replace(' ', '\n') for k in runs.keys()], rotation=0, ha='center', fontsize=10)
ax.set_ylabel('Accuracy (%)', fontsize=14, fontweight='bold')
ax.set_title('Training Accuracy Comparison', fontsize=16, fontweight='bold', pad=20)
ax.set_ylim(0, 50)
ax.grid(axis='y', alpha=0.3)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)

# Add value labels on bars
for i, (bar, acc) in enumerate(zip(bars, accuracies)):
    height = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2., height + 1, f'{acc:.1f}%', 
            ha='center', va='bottom', fontsize=11, fontweight='bold')

# Add legend
red_patch = mpatches.Patch(color='red', alpha=0.7, label='Failed (no learning)')
green_patch = mpatches.Patch(color='green', alpha=0.7, label='Success (learning achieved)')
ax.legend(handles=[red_patch, green_patch], loc='upper right', fontsize=12)

plt.tight_layout()
plt.savefig(output_dir / 'accuracy_comparison.png', dpi=300, bbox_inches='tight')
plt.savefig(output_dir / 'accuracy_comparison.svg', format='svg', bbox_inches='tight')
plt.close()

# Figure 2: Loss Comparison
fig, ax = plt.subplots(figsize=(12, 7))
losses = [runs[k]['loss'] for k in runs.keys()]
colors = ['red' if runs[k]['status'] == 'Failed' else 'green' for k in runs.keys()]
bars = ax.bar(range(len(runs)), losses, color=colors, alpha=0.7, edgecolor='black', linewidth=2)
ax.set_xticks(range(len(runs)))
ax.set_xticklabels([k.replace(' ', '\n') for k in runs.keys()], rotation=0, ha='center', fontsize=10)
ax.set_ylabel('Loss (Cross-Entropy)', fontsize=14, fontweight='bold')
ax.set_title('Training Loss Comparison', fontsize=16, fontweight='bold', pad=20)
ax.set_ylim(0, 2.5)
ax.grid(axis='y', alpha=0.3)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)

# Add value labels on bars
for i, (bar, loss) in enumerate(zip(bars, losses)):
    height = bar.get_height()
    ax.text(bar.get_x() + bar.get_width()/2., height + 0.05, f'{loss:.2f}', 
            ha='center', va='bottom', fontsize=11, fontweight='bold')

# Add random prediction line
ax.axhline(y=np.log(10), color='orange', linestyle='--', linewidth=2, label='Random Prediction (ln(10)=2.30)')
ax.legend(loc='upper right', fontsize=12)

plt.tight_layout()
plt.savefig(output_dir / 'loss_comparison.png', dpi=300, bbox_inches='tight')
plt.savefig(output_dir / 'loss_comparison.svg', format='svg', bbox_inches='tight')
plt.close()

# Figure 3: Key Findings Timeline
fig, ax = plt.subplots(figsize=(14, 8))
findings = [
    ('Initial Training\n(with quantization)', 'Failed', 'Loss stuck at 2.30\nAccuracy 0%'),
    ('Disable Quantization', 'Success', 'Loss: 2.30→1.10\nAccuracy: 10%→34%'),
    ('Linear Baseline', 'Success', 'Loss: 1.10\nAccuracy: 33%'),
    ('Real Data Integration', 'Success', '100 real transactions\nAPI limited'),
    ('Mixed Corpus Training', 'Success', 'Accuracy: 33%→45%\nLoss: 1.58→0.85')
]

y_positions = range(len(findings))
colors = ['red' if f[1] == 'Failed' else 'green' for f in findings]

for i, (title, status, detail) in enumerate(findings):
    # Draw box
    ax.barh(i, 1, height=0.6, left=0, color=colors[i], alpha=0.3, edgecolor=colors[i], linewidth=2)
    
    # Add title
    ax.text(0.5, i, title, ha='center', va='center', fontsize=12, fontweight='bold')
    
    # Add detail
    ax.text(1.1, i, detail, ha='left', va='center', fontsize=10)

ax.set_xlim(0, 3.5)
ax.set_ylim(-0.5, len(findings) - 0.5)
ax.set_yticks(y_positions)
ax.set_yticklabels([])
ax.set_xlabel('', fontsize=14, fontweight='bold')
ax.set_title('Key Findings Timeline', fontsize=16, fontweight='bold', pad=20)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_visible(False)
ax.spines['bottom'].set_visible(False)
ax.set_xticks([])

plt.tight_layout()
plt.savefig(output_dir / 'findings_timeline.png', dpi=300, bbox_inches='tight')
plt.savefig(output_dir / 'findings_timeline.svg', format='svg', bbox_inches='tight')
plt.close()

# Figure 4: Bottlenecks and Solutions
fig, ax = plt.subplots(figsize=(14, 10))
bottlenecks = [
    ('Quantization Blocks Learning', 'Critical', 'TernaryAdam + ternary quantization\nprevented gradient flow'),
    ('API Pagination Limited', 'High', 'Hedera mirror node limited to\n100 transactions per request'),
    ('Class Imbalance', 'Medium', '79% CONSENSUSSUBMITMESSAGE\nin real data'),
    ('Dataset Size', 'High', 'Only 100 real transactions\nvs 10K target')
]

solutions = [
    ('Use Standard Adam\nDisable quantization during training', 'Implemented'),
    ('Use Hedera SDK\nSet up local mirror node', 'Pending'),
    ('Oversampling\nClass weighting', 'Not started'),
    ('Alternative data sources\nAccount-based fetching', 'Pending')
]

y_positions = range(len(bottlenecks))
bottleneck_colors = {'Critical': 'red', 'High': 'orange', 'Medium': 'yellow'}
solution_colors = {'Implemented': 'green', 'Pending': 'orange', 'Not started': 'gray'}

for i, ((b_title, b_severity, b_detail), (s_title, s_status)) in enumerate(zip(bottlenecks, solutions)):
    y = len(bottlenecks) - 1 - i
    
    # Bottleneck box
    ax.barh(y, 1, height=0.7, left=0, color=bottleneck_colors[b_severity], alpha=0.3, 
            edgecolor=bottleneck_colors[b_severity], linewidth=2)
    ax.text(0.5, y, b_title, ha='center', va='center', fontsize=11, fontweight='bold')
    ax.text(1.1, y, b_detail, ha='left', va='center', fontsize=9)
    
    # Solution box
    ax.barh(y - 0.4, 1, height=0.3, left=0, color=solution_colors[s_status], alpha=0.3,
            edgecolor=solution_colors[s_status], linewidth=2)
    ax.text(0.5, y - 0.4, s_title, ha='center', va='center', fontsize=9)

ax.set_xlim(0, 3)
ax.set_ylim(-1, len(bottlenecks))
ax.set_yticks([])
ax.set_xlabel('', fontsize=14, fontweight='bold')
ax.set_title('Bottlenecks and Solutions', fontsize=16, fontweight='bold', pad=20)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_visible(False)
ax.spines['bottom'].set_visible(False)
ax.set_xticks([])

# Add legend for severity
legend_elements = [mpatches.Patch(color=color, alpha=0.3, label=sev) 
                   for sev, color in bottleneck_colors.items()]
ax.legend(handles=legend_elements, loc='upper right', fontsize=10)

plt.tight_layout()
plt.savefig(output_dir / 'bottlenecks_solutions.png', dpi=300, bbox_inches='tight')
plt.savefig(output_dir / 'bottlenecks_solutions.svg', format='svg', bbox_inches='tight')
plt.close()

# Figure 5: Potential and Next Steps
fig, ax = plt.subplots(figsize=(12, 8))
potential_items = [
    ('Scale to 10K+ Real Transactions', 'High', 'Use Hedera SDK or local mirror node'),
    ('Hyperparameter Tuning', 'Medium', 'Learning rate, batch size, model capacity'),
    ('Address Class Imbalance', 'Medium', 'Oversampling, class weighting'),
    ('Train 50 Specialists', 'High', 'All specialists with real data'),
    ('Validate >60% Accuracy', 'High', 'Architecture evidence collection'),
    ('Architecture Comparison', 'Medium', 'BitLattice vs standard MLP')
]

y_positions = range(len(potential_items))
priority_colors = {'High': 'blue', 'Medium': 'purple'}

for i, (title, priority, detail) in enumerate(potential_items):
    ax.barh(i, 1, height=0.6, left=0, color=priority_colors[priority], alpha=0.3,
            edgecolor=priority_colors[priority], linewidth=2)
    ax.text(0.5, i, title, ha='center', va='center', fontsize=11, fontweight='bold')
    ax.text(1.1, i, detail, ha='left', va='center', fontsize=9)

ax.set_xlim(0, 3)
ax.set_ylim(-0.5, len(potential_items) - 0.5)
ax.set_yticks([])
ax.set_xlabel('', fontsize=14, fontweight='bold')
ax.set_title('Potential and Next Steps', fontsize=16, fontweight='bold', pad=20)
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
ax.spines['left'].set_visible(False)
ax.spines['bottom'].set_visible(False)
ax.set_xticks([])

# Add legend
legend_elements = [mpatches.Patch(color=color, alpha=0.3, label=prio) 
                   for prio, color in priority_colors.items()]
ax.legend(handles=legend_elements, loc='upper right', fontsize=12)

plt.tight_layout()
plt.savefig(output_dir / 'potential_next_steps.png', dpi=300, bbox_inches='tight')
plt.savefig(output_dir / 'potential_next_steps.svg', format='svg', bbox_inches='tight')
plt.close()

# Figure 6: Architecture Decision Flow
fig, ax = plt.subplots(figsize=(14, 10))
# Define nodes
nodes = {
    'Start': (0.5, 0.95),
    'BitLattice + TernaryAdam': (0.5, 0.82),
    'Learning?': (0.5, 0.68),
    'No': (0.3, 0.54),
    'Yes': (0.7, 0.54),
    'Disable Quantization': (0.3, 0.40),
    'Keep Architecture': (0.7, 0.40),
    'Standard Adam': (0.3, 0.26),
    'Add Real Data': (0.7, 0.26),
    'Result: 34% Acc': (0.3, 0.12),
    'Result: 45% Acc': (0.7, 0.12)
}

# Draw arrows
arrows = [
    ('Start', 'BitLattice + TernaryAdam'),
    ('BitLattice + TernaryAdam', 'Learning?'),
    ('Learning?', 'No'),
    ('Learning?', 'Yes'),
    ('No', 'Disable Quantization'),
    ('Yes', 'Keep Architecture'),
    ('Disable Quantization', 'Standard Adam'),
    ('Keep Architecture', 'Add Real Data'),
    ('Standard Adam', 'Result: 34% Acc'),
    ('Add Real Data', 'Result: 45% Acc')
]

for start, end in arrows:
    start_pos = nodes[start]
    end_pos = nodes[end]
    ax.annotate('', xy=end_pos, xytext=start_pos,
                arrowprops=dict(arrowstyle='->', lw=2, color='black'))

# Draw nodes
for label, (x, y) in nodes.items():
    color = 'red' if 'No' in label or '34%' in label else 'green' if 'Yes' in label or '45%' in label else 'lightblue'
    ax.add_patch(plt.Circle((x, y), 0.08, color=color, alpha=0.5, edgecolor='black', linewidth=2))
    ax.text(x, y, label, ha='center', va='center', fontsize=9, fontweight='bold')

ax.set_xlim(0, 1)
ax.set_ylim(0, 1)
ax.set_aspect('equal')
ax.axis('off')
ax.set_title('Architecture Decision Flow', fontsize=16, fontweight='bold', pad=20)

plt.tight_layout()
plt.savefig(output_dir / 'architecture_flow.png', dpi=300, bbox_inches='tight')
plt.savefig(output_dir / 'architecture_flow.svg', format='svg', bbox_inches='tight')
plt.close()

print(f"Generated visualizations in {output_dir}/")
print("Files created:")
print("  - accuracy_comparison.png/svg")
print("  - loss_comparison.png/svg")
print("  - findings_timeline.png/svg")
print("  - bottlenecks_solutions.png/svg")
print("  - potential_next_steps.png/svg")
print("  - architecture_flow.png/svg")
