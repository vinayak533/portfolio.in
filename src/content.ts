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
  /**
   * Optional reel or image. For video, `preview` (720p) plays on the 3D exhibit
   * and on small screens, `src` (1080p) in the case study, and `poster` is the
   * frame at `start` seconds, where playback begins. Built by `npm run videos`.
   */
  media?: ProjectMedia
  summary: string
  problem: string
  approach: string[]
  /** Key numbers, shown under "At a glance". */
  facts: { value: string; label: string }[]
  links?: { label: string; href: string }[]
}

export interface ProjectMedia {
  src: string
  preview?: string
  poster?: string
  start?: number
}

/** Paths written by scripts/prepare-videos.mjs for reel `id`. */
const reel = (id: string, start: number): ProjectMedia => ({
  src: `/works/${id}-1080.mp4`,
  preview: `/works/${id}-720.mp4`,
  poster: `/works/${id}.webp`,
  start,
})

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
    id: 'loom',
    title: 'Loom.ai',
    tagline: 'One AI workspace to chat, code in a live sandbox, study and delegate.',
    year: '2026',
    role: 'Solo build',
    tags: ['LangGraph', 'FastAPI', 'Next.js', 'E2B sandbox', 'pgvector'],
    visual: 'agents',
    media: reel('loom', 2.5),
    summary:
      'Four workspaces on one backend: tool-free Chat, sandboxed Code, source-grounded Learn and ten specialist Agents, sharing auth, model routing and streaming.',
    problem:
      'A chat window cannot run code or check an answer against your own documents. Coding, research and study each need a different way of working.',
    approach: [
      'The Code agent works in a real Linux sandbox (shell, files, web search, dev servers) and streams every tool call into a live trace and preview.',
      'Learn turns PDFs, links and YouTube transcripts into cited answers and graded courses, backed by pgvector.',
      'LangGraph routes each turn across eight models from Groq, OpenRouter and OpenCode, by hand or on Auto with fallback.',
    ],
    facts: [
      { value: '4', label: 'workspaces, one backend' },
      { value: '10', label: 'specialist agents' },
      { value: '8', label: 'models, auto-routed' },
    ],
    links: [{ label: 'GitHub', href: 'https://github.com/vinayak533/loom.ai' }],
  },
  {
    id: 'lazyhire',
    title: 'LazyHire',
    tagline: 'Where AI finds the job that finds you.',
    year: '2026',
    role: 'Solo build',
    tags: ['Next.js', 'TypeScript', 'SQLite + FTS5', 'MiniLM embeddings', 'Groq'],
    visual: 'rag',
    media: reel('lazyhire', 3),
    summary:
      'A job-search workspace for Kerala that merges listings from many boards, ranks them against your profile and explains every match.',
    problem:
      'Kerala job listings are scattered across many sites, full of duplicates, missing dates and apply links that only lead to a company homepage.',
    approach: [
      'Source-aware search across Technopark, Infopark, UL CyberPark and more, with duplicate merging and apply-link validation.',
      'Transparent fit ranking on freshness, location, role, skills and preferences, so every score can be inspected.',
      'CV scoring and guarded AI tailoring that rejects invented experience, numbers or credentials.',
    ],
    facts: [
      { value: '9', label: 'job sources merged' },
      { value: '4', label: 'application stages tracked' },
      { value: 'PDF · DOCX', label: 'private CV review' },
    ],
    links: [{ label: 'GitHub', href: 'https://github.com/vinayak533/lazyhire' }],
  },
  {
    id: 'bank-churn',
    title: 'Bank Churn Intelligence',
    tagline: 'Predicts which customers will leave, then explains why in plain words and voice.',
    year: '2026',
    role: 'Solo build',
    tags: ['XGBoost', 'SMOTE', 'FastAPI', 'Llama 3.3 70B', 'ElevenLabs'],
    visual: 'pipeline',
    media: reel('aria', 6),
    summary:
      'ARIA turns a customer profile into a churn probability, a risk tier and the model’s key drivers, then lets staff ask an AI advisor what to do next.',
    problem:
      'A churn score alone is not enough: bank staff need a risk assessment they can understand and talk through with the customer.',
    approach: [
      'XGBoost classifier trained on 10,000 customer records, with SMOTE for class imbalance and one scaler shared by training and inference.',
      'A FastAPI service returns the churn probability, a low / medium / high tier and the top five model drivers.',
      'Llama 3.3 70B on Groq explains each result in plain language, and ElevenLabs reads it aloud.',
    ],
    facts: [
      { value: '10k', label: 'customer records' },
      { value: '3', label: 'risk tiers' },
      { value: '5', label: 'drivers surfaced' },
    ],
    links: [{ label: 'GitHub', href: 'https://github.com/vinayak533/bank-churn-intelligence-platform' }],
  },
  {
    id: 'health',
    title: 'Health Assistant',
    tagline: 'Ask a health question out loud, show an image, hear the answer.',
    year: '2026',
    role: 'Solo build',
    tags: ['Whisper large-v3', 'Llama 4 Scout', 'ElevenLabs', 'Groq', 'Gradio'],
    visual: 'vision',
    media: reel('health', 14),
    summary:
      'A voice and vision assistant that transcribes a spoken question, reads it together with a medical image, and replies in text and speech. A learning project, not a clinical tool.',
    problem:
      'Answering a spoken question about an image takes three models (speech-to-text, vision and text-to-speech) working inside one request.',
    approach: [
      'Whisper large-v3 on Groq transcribes the question recorded in the browser.',
      'Llama 4 Scout reasons over the transcript and the uploaded image together.',
      'ElevenLabs speaks the reply; empty recordings are rejected before any API call.',
    ],
    facts: [
      { value: '3', label: 'models in one flow' },
      { value: 'Voice + image', label: 'input' },
      { value: 'Text + speech', label: 'output' },
    ],
    links: [{ label: 'GitHub', href: 'https://github.com/vinayak533/AI-Medical-Voice-Vision-Assistant' }],
  },
  {
    id: 'predictlab',
    title: 'PredictLab',
    tagline: 'From raw health data to real insights.',
    year: '2026',
    role: 'Solo build',
    tags: ['scikit-learn', 'FastAPI', 'Llama 3.1', 'Docker', 'Hugging Face'],
    visual: 'recsys',
    media: reel('predictlab', 1.5),
    summary:
      'A full-stack ML app that predicts diabetes, stroke and heart-disease risk from health metrics, with an AI assistant that explains each result.',
    problem:
      'A bare “Diabetic / Not Diabetic” label raises more questions than it answers for someone without an ML background.',
    approach: [
      'Three scikit-learn models: SVM for diabetes, Random Forest for stroke and Logistic Regression for heart disease.',
      'One FastAPI service serves the pages, the prediction endpoints and the assistant, with no frontend build step.',
      'Each result and its inputs go to Llama 3.1 on Groq for a plain-language explanation and follow-up questions.',
    ],
    facts: [
      { value: '3', label: 'disease models' },
      { value: '30', label: 'health inputs' },
      { value: 'Live', label: 'on Hugging Face Spaces' },
    ],
    links: [
      { label: 'Live demo', href: 'https://huggingface.co/spaces/VINAYAKKV/Predict-Ai' },
      { label: 'GitHub', href: 'https://github.com/vinayak533/PredictLab-' },
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
