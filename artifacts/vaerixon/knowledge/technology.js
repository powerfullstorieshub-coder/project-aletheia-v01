export const categories = [
  {
    id: "ai-technology",
    label: "AI and technology",
    topics: [
      {
        id: "machine-learning",
        aliases: ["machine learning", "ml", "machine-learning"],
        levels: {
          basic: "**Machine learning** is a way to build systems that learn patterns from data and use those patterns to make predictions or decisions. The system still depends on data, objectives, evaluation, and human choices.",
          intermediate: "Supervised learning uses labeled examples, unsupervised learning looks for structure without target labels, and reinforcement learning uses feedback from actions. Generalization to new data matters more than memorizing the training set.",
          advanced: "A machine-learning system is shaped by representation, hypothesis class, objective function, optimization, data distribution, regularization, evaluation design, and deployment context. Good benchmark performance does not automatically establish causal understanding, robustness, fairness, or safety.",
        },
      },
      {
        id: "generative-ai",
        aliases: ["generative ai", "gen ai", "large language model", "llm", "ai model"],
        levels: {
          basic: "**Generative AI** produces text, images, audio, code, or other outputs by modeling patterns in data. A language model predicts likely token sequences; it does not guarantee that every statement is true.",
          intermediate: "Large language models use neural networks trained on large collections of text and then adapted through additional training or instructions. Their outputs depend on context, sampling, training data, evaluation, and tool access. They can be useful while still producing confident errors.",
          advanced: "Modern language models learn distributed representations and conditional sequence distributions, often using transformer architectures. Alignment and instruction tuning shape behavior but do not replace verification, provenance, threat modeling, or domain-specific evaluation. Capability, reliability, and agency are separate questions.",
        },
      },
    ],
  },
  {
    id: "computers-software",
    label: "Computers and software",
    topics: [
      {
        id: "algorithm",
        aliases: ["algorithm", "algorithms", "algorithmic thinking"],
        levels: {
          basic: "An **algorithm** is a finite, unambiguous procedure for transforming input into output or solving a problem. It should handle relevant edge cases and terminate.",
          intermediate: "Algorithms are evaluated for correctness, time complexity, space complexity, maintainability, and fit with the problem's constraints. For example, O(n) work grows roughly in proportion to input size, while O(n²) work can grow much faster.",
          advanced: "Algorithm analysis studies resource bounds, invariants, lower bounds, amortized cost, approximation, randomized behavior, and trade-offs among time, space, communication, and implementation complexity. Big-O notation describes asymptotic growth, not exact runtime.",
        },
      },
      {
        id: "operating-system",
        aliases: ["operating system", "operating systems", "os", "computer operating system"],
        levels: {
          basic: "An **operating system** manages a computer's hardware and provides common services for programs. It handles processes, memory, files, devices, permissions, and user interaction.",
          intermediate: "The operating system separates applications from hardware through abstractions such as processes, virtual memory, filesystems, system calls, and device drivers. Scheduling and protection let many programs share resources without unrestricted access to one another.",
          advanced: "Operating-system design coordinates concurrency, address spaces, interrupts, I/O, persistence, isolation, scheduling policy, and failure recovery. Abstractions simplify application development but introduce costs such as context switching, caching effects, synchronization hazards, and security boundaries.",
        },
      },
    ],
  },
  {
    id: "prompt-engineering",
    label: "Prompt engineering",
    topics: [
      {
        id: "prompt-framework",
        aliases: [
          "prompt engineering",
          "prompt",
          "prompting",
          "create a prompt",
          "write a prompt",
          "instruction for an ai",
          "six pillar prompt framework",
          "six-pillar prompt framework",
          "task context example persona format tone",
        ],
        levels: {
          basic: "A strong prompt states the **TASK**, supplies relevant **CONTEXT**, identifies the desired **FORMAT**, and sets an appropriate **TONE**. Add an **EXAMPLE** or **PERSONA** only when it reduces ambiguity or improves the result.",
          intermediate: "Improve a prompt by specifying the objective, audience, constraints, inputs, success criteria, desired output, and assumptions. Use TASK, CONTEXT, EXAMPLE, PERSONA, FORMAT, and TONE selectively rather than adding headings that do not change the work.",
          advanced: "Prompt design is an iterative specification process: define the objective, expose ambiguity, constrain unacceptable behavior, provide representative examples when needed, choose an output contract, and evaluate results against explicit criteria. Refinement should target observed failure modes rather than adding verbosity.",
        },
        dynamicAnswer: ({ analysis, prompt }) => {
          const asksSixPillars = /\b(?:six[ -]pillar|six pillars|prompt framework|task context example persona format tone)\b/i.test(prompt);
          if (analysis.taskType !== "prompt-building" && !asksSixPillars) return "";
          if (asksSixPillars) {
            return [
              "The six-pillar prompt framework is a practical checklist:",
              "",
              "1. **TASK** — what the model must do.",
              "2. **CONTEXT** — the facts, background, inputs, and constraints it needs.",
              "3. **EXAMPLE** — a representative example when the expected result is ambiguous.",
              "4. **PERSONA** — the relevant expertise or point of view.",
              "5. **FORMAT** — the required structure, fields, length, or output type.",
              "6. **TONE** — how the response should sound.",
              "",
              "Use only the pillars that improve the result. More instructions are not automatically better.",
            ].join("\n");
          }
          return [
            "Here is a copy-ready prompt:",
            "",
            "### Task",
            "Act as a business analyst. Analyze my business and produce a practical assessment of its current position, opportunities, risks, and highest-leverage next actions.",
            "",
            "### Context",
            "Use the business information I provide, including the product or service, target customers, market, business model, current performance, constraints, and goals. Separate known facts from assumptions and identify the most important missing information.",
            "",
            "### Persona",
            "Think like a rigorous, commercially aware business analyst. Be objective, evidence-led, and practical rather than motivational.",
            "",
            "### Format",
            "Structure the response as: executive summary; key assumptions; strengths; weaknesses; opportunities; risks; prioritized recommendations; and a 30/60/90-day action plan. Explain the reasoning behind each priority and flag uncertainty.",
            "",
            "### Tone",
            "Professional, clear, direct, and constructive. Avoid generic advice and unsupported claims.",
          ].join("\n");
        },
      },
    ],
  },
];