/**
 * Every word on the site lives here. Swap freely: the layout is built to
 * absorb short or long values (names, taglines, bullet lengths, counts).
 */

export type VisualKind = 'rag' | 'vision' | 'pipeline' | 'agents' | 'recsys'

export interface Project {
  id: string
  title: string
  tagline: string
  /**
   * Pitch shown as the Overview in the details view. An optional first line
   * before `\n` is set as a lead, brighter than the rest.
   */
  caption: string
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

/** A caption's optional lead line and the body after it. */
export function captionParts(caption: string) {
  const i = caption.indexOf('\n')
  return i < 0 ? { lead: '', body: caption } : { lead: caption.slice(0, i), body: caption.slice(i + 1) }
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
  role: 'AI / ML Engineer',
  /** The hero's one line under the name. */
  tagline: 'I take autonomous agents from prototype chaos to production.',
  location: 'Kochi, Kerala, India',
  timezone: 'Asia/Kolkata',
  timezoneLabel: 'IST',
  intro:
    'I build LLM applications and agent systems: tool-using agents, retrieval with citations, and the FastAPI and Next.js backends behind them.',
  availability: 'Open to AI/ML engineering roles',
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
  heading: ['I work where', 'the demo ends.'],
  /** Rendered as: <before><name><after>, with the name emphasised. */
  intro: {
    before: 'I’m ',
    name: 'Vinayak',
    after: ', an AI/ML engineer at AMnova Technologies in Kochi, building multi-agent workflows and LLM pipelines, and a HackerRank Orchestrate finalist.',
  },
  /** One paragraph per entry. */
  body: [
    'Anyone can make a model look smart for a minute. I build what comes after.',
    'Agents, RAG, and LLM apps, wired into real data and real backends.',
  ],
  closing: 'That’s where a prototype becomes a product.',
}

export const projects: Project[] = [
  {
    id: 'loom',
    title: 'Loom.ai',
    tagline: 'One AI workspace to chat, code in a live sandbox, study and delegate.',
    caption:
      'Chatbots talk about code. Loom actually runs it.\nOne FastAPI and LangGraph backend behind four workspaces: Chat, a Code agent in an E2B Linux sandbox, cited Learn notebooks and ten specialist agents. Each turn routes across eight models from Groq, OpenRouter and OpenCode, with provider fallback. Caching the transcript cut the measured median time to first token from 8.9 s to 5.0 s on an ~80k-token test conversation.',
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
      'Learn turns PDFs, links and YouTube transcripts into cited answers and graded courses; notebook retrieval uses lexical hashed vectors stored in pgvector.',
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
    caption:
      'I built LazyHire, a private AI career workspace: local semantic retrieval, job deduplication, transparent match scoring, and guarded CV tailoring that rejects any edit adding experience, numbers or credentials that cannot be traced to your CV.',
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
    caption:
      'A prototype decision tool for bank staff: an XGBoost churn classifier trained on a 10,000-customer dataset, served by FastAPI with a risk tier and the model’s top features, then explained in plain language by Llama 3.3 70B and read aloud with ElevenLabs.',
    year: '2026',
    role: 'Solo build',
    tags: ['XGBoost', 'SMOTE', 'FastAPI', 'Llama 3.3 70B', 'ElevenLabs'],
    visual: 'pipeline',
    media: reel('aria', 6),
    summary:
      'The app, ARIA, turns a customer profile into a churn probability and a risk tier, shows the model’s top features, then lets staff ask an AI advisor what to do next.',
    problem:
      'A churn score alone is not enough: bank staff need a risk assessment they can understand and talk through with the customer.',
    approach: [
      'XGBoost classifier trained on 10,000 customer records, with SMOTE for class imbalance and one scaler shared by training and inference.',
      'A FastAPI service returns the churn probability and a low / medium / high tier; the interface shows the model’s global feature rankings.',
      'Llama 3.3 70B on Groq explains each result in plain language, and ElevenLabs reads it aloud.',
    ],
    facts: [
      { value: '10k', label: 'customer records' },
      { value: '3', label: 'risk tiers' },
      { value: '5', label: 'top features shown' },
    ],
    links: [{ label: 'GitHub', href: 'https://github.com/vinayak533/bank-churn-intelligence-platform' }],
  },
  {
    id: 'health',
    title: 'Health Assistant',
    tagline: 'Ask a health question out loud, show an image, hear the answer.',
    caption:
      'A learning project, built on open-source code.\nIt extends the AI Doctor 2.0 voice-and-vision demo by AIwithHassan, which chains Groq Whisper, a Llama 4 Scout vision model and ElevenLabs speech. I rebuilt its single-form interface as a custom Gradio Blocks layout and adapted the pipeline modules. Not a clinical tool.',
    year: '2026',
    role: 'Extended open-source project',
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
    links: [
      { label: 'GitHub', href: 'https://github.com/vinayak533/AI-Medical-Voice-Vision-Assistant' },
      { label: 'Original project', href: 'https://github.com/AIwithhassan/ai-doctor-2.0-voice-and-vision' },
    ],
  },
  {
    id: 'predictlab',
    title: 'PredictLab',
    tagline: 'From raw health data to real insights.',
    caption:
      'A FastAPI app, deployed on Hugging Face Spaces, that serves three scikit-learn classifiers for diabetes, stroke and heart-disease screening from 30 health inputs, with Llama 3.1 8B on Groq explaining each result in plain language.',
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
      { value: 'Demo', label: 'on Hugging Face (may take a minute to wake)' },
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
    company: 'Cognifyz Technologies',
    title: 'Data Science Intern',
    start: 'Aug 2025',
    end: 'Sep 2025',
    summary: 'Developed and evaluated classification models with feature engineering, model tuning, and performance analysis.',
    highlights: ['classification models', 'feature engineering', 'model tuning'],
  },
]

/**
 * The one place for contact details: the hero, the menu, Contact, the form's
 * fallback and index.html's <noscript> all use these. The server's delivery
 * default (server/contact.ts) matches `email`.
 */
export const contact = {
  heading: 'Let’s build something real',
  lede: ['Hiring for an AI/ML or backend role?', 'Email me or send a message below.'],
  email: 'vinayakkv2004@gmail.com',
  links: [
    { label: 'GitHub', href: 'https://github.com/vinayak533' },
    { label: 'LinkedIn', href: 'https://www.linkedin.com/in/vinayak-kv-ds' },
  ],
  /** Linked only once this file is actually served (src/dom/useResumeUrl.ts): drop the PDF at public/resume.pdf. */
  resume: '/resume.pdf',
}

export const sections = [
  { id: 'hero', label: 'Index' },
  { id: 'about', label: 'About' },
  { id: 'works', label: 'Works' },
  { id: 'experience', label: 'Experience' },
  { id: 'contact', label: 'Contact' },
] as const

export type SectionId = (typeof sections)[number]['id']
