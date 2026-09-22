export const categories = [
  {
    id: "general-knowledge",
    label: "General knowledge",
    topics: [
      {
        id: "critical-thinking",
        aliases: ["critical thinking", "critical reasoning", "reason critically"],
        levels: {
          basic: "**Critical thinking** means separating a claim, its evidence, its assumptions, and its conclusion. Confidence should match the quality of the reasons.",
          intermediate: "Evaluate what a claim means, what evidence supports it, how reliable the source is, what alternatives exist, and what evidence would change your mind. Critical thinking is not automatic skepticism; it is disciplined proportioning of confidence.",
          advanced: "A rigorous critique makes the inference chain explicit, tests scope and counterexamples, distinguishes correlation from causation, checks measurement and selection effects, and states residual uncertainty. The standard of evidence should fit the stakes and claim type.",
        },
      },
    ],
  },
  {
    id: "finance-money",
    label: "Finance and money",
    topics: [
      {
        id: "budgeting",
        aliases: ["budget", "budgeting", "personal finance", "manage money"],
        levels: {
          basic: "A **budget** is a plan for how money will be received, spent, saved, or invested over a period. A useful budget starts with actual income and recurring needs, then assigns limits to flexible spending.",
          intermediate: "A practical budget separates fixed costs, variable needs, discretionary spending, irregular expenses, debt obligations, and savings goals. It should include a buffer and be reviewed against real transactions rather than treated as a one-time promise.",
          advanced: "Financial planning balances liquidity, emergency reserves, debt cost, time horizon, risk capacity, taxes, inflation, and goals. Personal recommendations require individual facts; a general framework is not financial advice tailored to a specific person.",
        },
      },
      {
        id: "compound-interest",
        aliases: ["compound interest", "compounding", "interest"],
        levels: {
          basic: "**Compound interest** means earning interest on the original amount and on earlier interest. Over time, this can make growth or debt accelerate.",
          intermediate: "With a constant periodic rate, compound growth can be represented as A = P(1 + r/n)^(nt), where P is principal, r is the annual rate, n is the number of compounding periods per year, and t is time in years.",
          advanced: "Compounding comparisons must specify nominal versus effective rates, payment timing, fees, taxes, inflation, and whether contributions are made at the beginning or end of periods. A mathematically higher return can still be unsuitable when liquidity or risk constraints differ.",
        },
      },
    ],
  },
  {
    id: "education-learning",
    label: "Education and learning",
    topics: [
      {
        id: "spaced-repetition",
        aliases: ["spaced repetition", "study effectively", "learn effectively", "learning"],
        levels: {
          basic: "**Spaced repetition** means reviewing information across increasing intervals instead of cramming it all at once. Retrieval from memory is usually more useful than only rereading.",
          intermediate: "Effective learning combines retrieval practice, spaced review, feedback, worked examples, deliberate practice, and transfer to new problems. The best schedule depends on difficulty, prior knowledge, and how soon the knowledge must be used.",
          advanced: "Learning performance reflects encoding, retrieval strength, storage strength, feedback quality, interference, and task design. A strong curriculum alternates explanation with effortful retrieval and uses varied contexts so learners can recognize when a concept applies.",
        },
      },
      {
        id: "python-learning",
        aliases: ["learn python", "learning python", "python roadmap", "python learning path"],
        levels: {
          basic: "A practical Python path starts with variables, strings, numbers, conditionals, loops, and functions. Build tiny scripts as soon as the basics make sense.",
          intermediate: "Next learn lists, dictionaries, files, exceptions, modules, testing, and debugging. Build a command-line tool, a data report, or an automation script to connect concepts.",
          advanced: "After core Python, choose a direction such as web development, automation, data analysis, or machine learning. Study packaging, typing, testing, profiling, concurrency, and the conventions of that ecosystem through progressively larger projects.",
        },
      },
    ],
  },
  {
    id: "mathematics-logic",
    label: "Mathematics and logic",
    topics: [
      {
        id: "probability",
        aliases: ["probability", "probabilities", "probability theory"],
        levels: {
          basic: "**Probability** measures uncertainty from 0 to 1, or from 0% to 100%. For equally likely outcomes, it is favorable outcomes divided by total outcomes.",
          intermediate: "Conditional probability updates a belief when information is known: P(A|B) = P(A and B) / P(B). A careful solution defines the events, checks independence assumptions, and keeps the denominator aligned with the information available.",
          advanced: "Probability models specify a sample space, events, a measure, and assumptions about dependence. Bayesian updating combines a prior with a likelihood, while frequentist procedures describe long-run behavior under a data-generating process; neither removes the need to assess model fit.",
        },
      },
      {
        id: "deductive-reasoning",
        aliases: ["deductive reasoning", "deduction", "deductive logic"],
        levels: {
          basic: "**Deductive reasoning** derives a conclusion that must be true if its premises are true and the argument form is valid.",
          intermediate: "For example: all mammals are warm-blooded; whales are mammals; therefore whales are warm-blooded. Validity concerns the structure, while soundness additionally requires true premises.",
          advanced: "Formal deduction evaluates syntax, semantics, validity, and proof rules within a logical system. A valid argument preserves truth from premises to conclusion, but choosing relevant premises and translating natural language remain substantive reasoning tasks.",
        },
      },
    ],
  },
  {
    id: "games-gaming",
    label: "Games and gaming",
    topics: [
      {
        id: "game-loop",
        aliases: ["game loop", "game loops", "video game loop"],
        levels: {
          basic: "A **game loop** is the repeating cycle through which a game reads input, updates its state, and produces an output such as a rendered frame or result.",
          intermediate: "A real-time loop usually separates input handling, simulation updates, collision or rule checks, and rendering. Fixed or bounded time steps can make physics and behavior more stable across different frame rates.",
          advanced: "Engine loops coordinate scheduling, simulation time, rendering latency, networking, audio, persistence, and determinism. The right architecture depends on whether the game is real-time, turn-based, networked, physics-heavy, or primarily event-driven.",
        },
      },
      {
        id: "game-theory",
        aliases: ["game theory", "strategic games", "strategy and incentives"],
        levels: {
          basic: "**Game theory** studies situations where the outcome of one decision depends on the decisions of others. It models players, choices, information, and payoffs.",
          intermediate: "A strategy describes how a player acts across possible situations. Concepts such as dominant strategies, Nash equilibrium, and cooperation help analyze incentives, but models are only as useful as their assumptions about information and payoffs.",
          advanced: "Game-theoretic analysis distinguishes normal-form and extensive-form games, information structure, mixed strategies, repeated interaction, mechanism design, and equilibrium concepts. Predictive usefulness depends on behavior, institutions, and whether the modeled incentives match the real setting.",
        },
      },
    ],
  },
  {
    id: "everyday-practical",
    label: "Everyday practical knowledge",
    topics: [
      {
        id: "unit-conversion",
        aliases: ["unit conversion", "convert units", "measurements"],
        levels: {
          basic: "Unit conversion changes the representation of a quantity without changing the quantity itself. Multiply by a ratio equal to one, such as 100 centimeters divided by 1 meter.",
          intermediate: "Write units alongside numbers and cancel them algebraically. This exposes direction errors, keeps scale factors visible, and helps distinguish length, area, volume, mass, time, and rates.",
          advanced: "Dimensional analysis checks whether equations are physically coherent and can reveal missing factors before calculation. It cannot by itself establish numerical constants, model validity, or the meaning of a quantity.",
        },
      },
    ],
  },
];