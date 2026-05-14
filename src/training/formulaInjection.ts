/**
 * Vera Formula Injection Module
 * Pre-trains core formulas before problem attempts
 */

export const formulaModules = {
  workRate: {
    formulas: [
      {
        name: 'Work Rate Basics',
        rule: 'If A takes X days and B takes Y days, together they take: (X × Y) / (X + Y) days',
        examples: [
          { problem: 'A=4 days, B=6 days', solution: '(4×6)/(4+6) = 24/10 = 2.4 days' }
        ]
      },
      {
        name: 'Multiple Same Workers',
        rule: 'N workers with time T each: Total time = T / N',
        examples: [
          { problem: '3 workers, 12 days each', solution: '12/3 = 4 days' }
        ]
      },
      {
        name: 'Efficiency Factor',
        rule: 'If worker is N× as efficient: Their rate = N × standard rate',
        examples: [
          { problem: 'B is 2× as fast as A (6 days)', solution: 'B takes 6/2 = 3 days' }
        ]
      }
    ]
  },

  speedMath: {
    formulas: [
      {
        name: 'DST Triangle',
        rule: 'Distance = Speed × Time | Speed = Distance / Time | Time = Distance / Speed',
        visual: `
          D
         / \\
        S × T
        `,
        method: 'Cover what you need: D=S×T, S=D/T, T=D/S'
      },
      {
        name: 'Unit Consistency',
        rule: 'Convert all to same units before calculating',
        examples: [
          { step: '1. Convert km to m (×1000)' },
          { step: '2. Convert hours to minutes (×60)' },
          { step: '3. Calculate' },
          { step: '4. Convert back if needed' }
        ]
      }
    ]
  },

  percentages: {
    formulas: [
      {
        name: 'Percentage Change',
        rule: 'Increase: Original × (1 + %/100) | Decrease: Original × (1 - %/100)',
        examples: [
          { problem: 'Increase 80 by 25%', solution: '80 × 1.25 = 100' },
          { problem: 'Decrease 100 by 20%', solution: '100 × 0.80 = 80' }
        ]
      },
      {
        name: 'Reverse Percentage',
        rule: 'If X% of Y = Z, then Y = Z / (X/100)',
        examples: [
          { problem: '25% of Y = 50', solution: 'Y = 50 / 0.25 = 200' }
        ]
      },
      {
        name: 'Successive Changes',
        rule: 'Multiply the multipliers: +20% then -20% = 1.20 × 0.80 = 0.96 (4% decrease)',
        warning: 'Never add percentages directly! Always multiply.'
      }
    ]
  },

  logic: {
    patterns: [
      {
        name: 'Syllogism Types',
        valid: [
          { form: 'All A are B, All B are C → All A are C', type: 'Barbara' },
          { form: 'No A are B, All B are C → No A are C', type: 'Celarent' },
          { form: 'All A are B, Some C are A → Some C are B', type: 'Darii' }
        ],
        invalid: [
          { form: 'All A are B, All C are B → All A are C', error: 'Undistributed middle' }
        ]
      },
      {
        name: 'If-Then Patterns',
        rule: 'If P then Q: Contrapositive is If not Q then not P (equivalent)',
        invalid: 'Converse (If Q then P) is NOT equivalent'
      }
    ]
  }
};

export function getFormulaPrompt(module: string, difficulty = 1) {
  const mod = formulaModules[module];
  if (!mod) return '';

  let prompt = `=== ${module.toUpperCase()} FORMULAS ===\n\n`;
  
  if (mod.formulas) {
    for (const f of mod.formulas) {
      prompt += `📐 ${f.name}\n`;
      prompt += `Rule: ${f.rule}\n`;
      if (f.visual) prompt += `Visual: ${f.visual}\n`;
      if (f.examples) {
        prompt += 'Examples:\n';
        for (const ex of f.examples) {
          if (ex.problem) prompt += `  ${ex.problem} → ${ex.solution}\n`;
          if (ex.step) prompt += `  - ${ex.step}\n`;
        }
      }
      if (f.warning) prompt += `⚠️  ${f.warning}\n`;
      prompt += '\n';
    }
  }

  if (mod.patterns) {
    for (const p of mod.patterns) {
      prompt += `🧩 ${p.name}\n`;
      if (p.rule) prompt += `Rule: ${p.rule}\n`;
      if (p.valid) {
        prompt += 'Valid Forms:\n';
        for (const v of p.valid) {
          prompt += `  ✓ ${v.form} (${v.type})\n`;
        }
      }
      if (p.invalid) {
        prompt += 'Invalid Forms:\n';
        for (const i of p.invalid) {
          prompt += `  ✗ ${i.form} - ${i.error}\n`;
        }
      }
      prompt += '\n';
    }
  }

  prompt += `=== APPLY THESE TO THE PROBLEM BELOW ===\n\n`;
  return prompt;
}

export function createTeachingProblem(module: string, difficulty: number) {
  const teachings = {
    workRate: [
      {
        setup: 'Worker A takes 5 days. Worker B takes 10 days.',
        question: 'How long together?',
        walkthrough: [
          'Step 1: A rate = 1/5 per day, B rate = 1/10 per day',
          'Step 2: Combined rate = 1/5 + 1/10 = 2/10 + 1/10 = 3/10 per day',
          'Step 3: Time = 1 / (3/10) = 10/3 ≈ 3.33 days',
          'Shortcut: (5×10)/(5+10) = 50/15 = 3.33 days ✓'
        ],
        answer: 3.33
      }
    ],
    speedMath: [
      {
        setup: 'Speed = 60 km/h, Distance = 180 km',
        question: 'Time needed?',
        walkthrough: [
          'Step 1: Identify what we need → Time',
          'Step 2: Use formula T = D/S',
          'Step 3: T = 180/60 = 3 hours'
        ],
        answer: 3
      }
    ],
    percentages: [
      {
        setup: 'Price increases from $80 to $100',
        question: 'Percentage increase?',
        walkthrough: [
          'Step 1: Change = New - Original = 100 - 80 = 20',
          'Step 2: % change = (Change/Original) × 100',
          'Step 3: (20/80) × 100 = 0.25 × 100 = 25%'
        ],
        answer: 25
      }
    ]
  };

  return teachings[module]?.[0];
}
