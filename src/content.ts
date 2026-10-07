/**
 * Every word on the site lives here. Swap freely: the layout is built to
 * absorb short or long values (names, taglines, bullet lengths, counts).
 */

export type VisualKind = 'rag' | 'vision' | 'pipeline' | 'agents' | 'recsys'

export interface Project {
  id: string
  title: string
  tagline: string
  year: string
  role: string
  tags: string[]
  /** Procedural shader used for the exhibit screen when no media is supplied. */
  visual: VisualKind
  /** Optional: '/works/rag.mp4' or '/works/rag.webp'. Poster is used while video loads. */
  media?: { src: string; poster?: string }
  summary: string
  problem: string
  approach: string[]
  outcomes: { value: string; label: string }[]
  links?: { label: string; href: string }[]
}

export interface Role {
  company: string
  title: string
  start: string
  end: string
  summary: string
  /** Phrases in `summary` that get the keyword underline. */
  highlights: string[]
}

export const site = {
  name: 'Vinayak K V',
  /** Short form used for the corner mark. */
  mark: 'VKV',
  role: 'AI / ML Engineer',
  location: 'Kochi, Kerala, India',
  timezone: 'Asia/Kolkata',
  timezoneLabel: 'IST',
  intro:
    'I build machine-learning systems that leave the notebook: retrieval, vision and agents running in production, measured in latency, cost and trust.',
  availability: 'Open to senior ML / applied AI roles',
  portrait: {
    /** Background-removed cutout produced by `npm run portrait`. */
    cutout: '/portrait/about.cutout.png',
    /** Lighter copy for the static / reduced-motion fallback. */
    still: '/portrait/about.cutout.webp',
    alt: 'Portrait of Vinayak K V',
  },
}

export const about = {
  kicker: 'About',
  heading: ['Building AI that works', 'beyond the demo'],
  /** Rendered as: <before><name><after>, with the name emphasised. */
  intro: { before: "I'm ", name: 'Vinayak', after: ', an AI/ML Engineer.' },
  body: 'I build Generative AI, agentic systems, and RAG, and I connect them to real backends so they ship as products people use.',
  /** Phrases in `body` that get the keyword underline. */
  highlights: ['Generative AI', 'agentic systems', 'RAG', 'real backends'],
  eyebrow: 'AI is the foundation.',
  closing: 'Impact is the goal.',
}

export const projects: Project[] = [
  {
    id: 'atlas-rag',
    title: 'Atlas',
    tagline: 'A retrieval assistant that cites every sentence it says.',
    year: '2025',
    role: 'Lead ML Engineer',
    tags: ['RAG', 'Hybrid search', 'Reranking', 'LLM eval', 'pgvector'],
    visual: 'rag',
    summary:
      'Enterprise knowledge assistant over 2.1M internal documents with sentence-level citations and an abstain-when-unsure policy.',
    problem:
      'Support engineers spent ~18 minutes per ticket hunting through wikis, runbooks and past incidents. A first chatbot hallucinated policy and lost trust in a week.',
    approach: [
      'Hybrid BM25 + dense retrieval with a cross-encoder reranker, chunked on document structure rather than token windows.',
      'Answer generation constrained to retrieved spans; every claim is linked to a source sentence or the model abstains.',
      'Offline eval harness of 1,400 graded questions gating every prompt, model and index change in CI.',
    ],
    outcomes: [
      { value: '-41%', label: 'time to resolution' },
      { value: '96.2%', label: 'citation precision' },
      { value: '0.8s', label: 'p50 answer latency' },
    ],
  },
  {
    id: 'iris-vision',
    title: 'Iris',
    tagline: 'Defect detection that runs on a $90 edge board.',
    year: '2024',
    role: 'ML Engineer, Vision',
    tags: ['Computer vision', 'Distillation', 'INT8', 'TensorRT', 'Active learning'],
    visual: 'vision',
    summary:
      'Real-time surface-defect detection for a manufacturing line, distilled from a large teacher into an INT8 student running at the edge.',
    problem:
      'Manual inspection missed hairline cracks at line speed, and cloud inference added 400ms of round trip the line could not afford.',
    approach: [
      'Teacher-student distillation from a ViT-L detector into a compact CNN, quantised to INT8 with calibration on hard negatives.',
      'Active-learning loop surfacing low-confidence frames to inspectors, cutting labelling cost per useful sample.',
      'Shadow deployment for six weeks before taking over the reject gate.',
    ],
    outcomes: [
      { value: '98.7%', label: 'recall on critical defects' },
      { value: '14ms', label: 'per-frame on device' },
      { value: '-72%', label: 'labelling cost' },
    ],
  },
  {
    id: 'conduit-pipeline',
    title: 'Conduit',
    tagline: 'Feature pipelines with contracts, lineage and one-click backfills.',
    year: '2024',
    role: 'ML Platform Engineer',
    tags: ['Feature store', 'Airflow', 'Spark', 'Data contracts', 'MLOps'],
    visual: 'pipeline',
    summary:
      'An internal ML pipeline platform: typed feature definitions, point-in-time correct training sets and reproducible backfills.',
    problem:
      'Twelve teams maintained bespoke training pipelines; silent schema drift broke models in production twice a quarter.',
    approach: [
      'Declarative feature specs compiled into batch and streaming jobs from a single definition.',
      'Data contracts enforced at ingestion with lineage tracked down to each model version.',
      'Point-in-time joins to eliminate label leakage in training sets.',
    ],
    outcomes: [
      { value: '12', label: 'teams migrated' },
      { value: '0', label: 'drift incidents in 3 quarters' },
      { value: '6x', label: 'faster backfills' },
    ],
  },
  {
    id: 'relay-agents',
    title: 'Relay',
    tagline: 'An agent framework that knows when to hand off to a human.',
    year: '2025',
    role: 'Founding Engineer',
    tags: ['Agents', 'Tool use', 'Planning', 'Guardrails', 'Tracing'],
    visual: 'agents',
    summary:
      'A typed, observable agent runtime for multi-step operations workflows with budgeted tool calls and explicit escalation.',
    problem:
      'Prototype agents looped, overspent and failed silently; nobody could explain a bad run after the fact.',
    approach: [
      'Planner-executor split with typed tool contracts and per-run token and cost budgets.',
      'Calibrated confidence gates that escalate to a human with a replayable trace instead of guessing.',
      'Full span tracing of every thought, tool call and retry, searchable by outcome.',
    ],
    outcomes: [
      { value: '71%', label: 'tickets fully automated' },
      { value: '-58%', label: 'cost per resolved task' },
      { value: '100%', label: 'runs replayable' },
    ],
  },
  {
    id: 'orbit-recsys',
    title: 'Orbit',
    tagline: 'Two-tower recommendations that learn within a session.',
    year: '2023',
    role: 'ML Engineer, Ranking',
    tags: ['Recommender systems', 'Two-tower', 'ANN', 'Online learning', 'A/B testing'],
    visual: 'recsys',
    summary:
      'Candidate generation and ranking for a content platform with session-aware embeddings refreshed in near real time.',
    problem:
      'Daily batch recommendations ignored what a user did five minutes ago, and cold-start items never surfaced.',
    approach: [
      'Two-tower retrieval with ANN serving and a lightweight session encoder updated on every interaction.',
      'Exploration budget for new items with calibrated uplift estimates.',
      'Interleaving experiments to read ranking changes in days instead of weeks.',
    ],
    outcomes: [
      { value: '+9.4%', label: 'session watch time' },
      { value: '+31%', label: 'new-item exposure' },
      { value: '22ms', label: 'p99 retrieval' },
    ],
  },
]

export const experience: Role[] = [
  {
    company: 'AMnova Technologies',
    title: 'AI/ML Engineer',
    start: 'Jun 2026',
    end: 'Present',
    summary: 'Building production AI systems, multi-agent workflows, LLM pipelines, and backend AI infrastructure.',
    highlights: ['production AI systems', 'multi-agent workflows', 'LLM pipelines'],
  },
  {
    company: 'Amdox',
    title: 'Data Science Intern',
    start: 'Apr 2026',
    end: 'May 2026',
    summary: 'Built ML models for demand forecasting and churn prediction using Python, XGBoost, and Scikit-learn.',
    highlights: ['demand forecasting', 'churn prediction', 'XGBoost'],
  },
  {
    company: 'Cognify Technologies',
    title: 'Data Science Intern',
    start: 'Aug 2025',
    end: 'Sep 2025',
    summary: 'Developed and evaluated classification models with feature engineering, model tuning, and performance analysis.',
    highlights: ['classification models', 'feature engineering', 'model tuning'],
  },
]

export const contact = {
  index: '05',
  kicker: 'Contact',
  heading: ['Let’s build', 'something', 'that matters.'],
  lede: ['Have an ambitious idea?', 'Let’s turn it into something worth building.'],
  email: 'vinayakkv04@gmail.com',
  phone: { label: '+91 9077252290', href: 'tel:+919077252290' },
  location: 'Kochi, Kerala, India',
  /** Shown beside the location as a quiet alignment cue. */
  coordinates: '9.93° N  76.27° E',
  links: [
    { label: 'GitHub', href: 'https://github.com/vinayak523' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/vinayak-k-v6' },
    /** Drop the PDF at public/resume.pdf. */
    { label: 'Résumé', href: '/resume.pdf' },
  ],
}

export const sections = [
  { id: 'hero', label: 'Index' },
  { id: 'about', label: 'About' },
  { id: 'works', label: 'Works' },
  { id: 'experience', label: 'Experience' },
  { id: 'contact', label: 'Contact' },
] as const

export type SectionId = (typeof sections)[number]['id']
