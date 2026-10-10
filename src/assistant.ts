/**
 * The chat assistant's own words (src/dom/chat). It has no language model:
 * everything it says about Vinayak's work is built from src/content.ts by
 * src/core/assistant.ts, so answers stay in step with the page. This file adds
 * the greeting, starter prompts, a few hand-written answers and `faq`, the
 * place for any extra Q&A.
 *
 * Answers are Markdown: **bold**, *italic*, `code`, lists, ``` fences and links.
 * Links may be https://, mailto:, a section on this page (#about, #works,
 * #experience, #contact) or a project's case study (#work-<project id>).
 */

export interface FaqEntry {
  /**
   * Questions or key phrases that should bring up this answer, e.g.
   * 'notice period' or 'What is his notice period?'. Matching ignores case,
   * punctuation and plurals; a phrase found inside the visitor's question wins.
   */
  ask: string[]
  /** Markdown. */
  answer: string
  /** Optional follow-up chips. Each should be a question the assistant can answer. */
  suggestions?: string[]
}

export const assistant = {
  name: 'Vinayak’s assistant',
  status: 'Online',
  launcherLabel: 'Chat with my assistant',
  greeting: {
    title: 'Hi, I’m Vinayak’s assistant',
    body: 'Ask me about his projects, experience, skills or how to reach him. I answer only from what’s on this portfolio.',
  },
  /** Shown before the first message. Each must be answerable (scripts/assistant.test.mjs checks). */
  starters: [
    'What does Vinayak work on?',
    'Show me his projects',
    'What’s his tech stack?',
    'How can I contact him?',
  ],
  placeholder: 'Ask about Vinayak’s work…',
  /** Longest question accepted, in characters. */
  maxLength: 500,

  /** What the assistant says about itself when asked whether it is an AI. */
  self:
    'I’m a scripted assistant: I answer from the content of this portfolio (projects, roles, skills and contact details). I don’t use a language model, so when something isn’t covered here I’ll say so rather than guess.',

  /** How this site is built (from package.json and the README). */
  site:
    'This portfolio is a React 19 and TypeScript app built with Vite. The 3D scenes use three.js through React Three Fiber with custom GLSL shaders, scroll choreography runs on GSAP and Lenis, and Tailwind handles layout. The contact form posts to a Vercel Function that delivers mail through Resend.',

  /**
   * Skills, grouped. Only names that actually appear in src/content.ts (project
   * tags, role summaries, the intro) are shown, so nothing here can claim a
   * skill the site doesn't evidence. Add a tag to a project and it shows up.
   */
  skillGroups: [
    { label: 'LLMs and agents', items: ['LangGraph', 'Llama 3.3 70B', 'Llama 3.1', 'Llama 4 Scout', 'Whisper large-v3', 'Groq', 'E2B sandbox'] },
    { label: 'Retrieval and data', items: ['pgvector', 'MiniLM embeddings', 'SQLite + FTS5'] },
    { label: 'Machine learning', items: ['Python', 'XGBoost', 'scikit-learn', 'SMOTE'] },
    { label: 'Backend and apps', items: ['FastAPI', 'Next.js', 'TypeScript', 'Gradio', 'Docker', 'Hugging Face'] },
    { label: 'Voice', items: ['ElevenLabs'] },
  ],

  /**
   * Extra names a visitor might use for a project, by project id. The title and
   * id already match on their own.
   */
  projectAliases: {
    loom: ['loom'],
    lazyhire: ['lazy hire'],
    'bank-churn': ['aria', 'churn', 'churn prediction app', 'bank'],
    health: ['ai doctor', 'medical assistant', 'voice assistant'],
    predictlab: ['predict lab', 'predict ai', 'predictai'],
  } as Record<string, string[]>,

  /**
   * When a visitor asks whether he knows something, these broaden the search
   * through the site's text (e.g. "RAG" is described as retrieval). Each value
   * is a word or phrase that appears in src/content.ts.
   */
  techSynonyms: {
    rag: ['retrieval', 'pgvector', 'cited'],
    'retrieval augmented generation': ['retrieval', 'pgvector', 'cited'],
    llm: ['llm', 'llama', 'langgraph'],
    llms: ['llm', 'llama', 'langgraph'],
    'large language model': ['llm', 'llama'],
    agent: ['agent'],
    'machine learning': ['xgboost', 'scikit-learn', 'classifier'],
    ml: ['xgboost', 'scikit-learn', 'classifier'],
    'computer vision': ['vision'],
    speech: ['whisper', 'elevenlabs', 'voice'],
    'text to speech': ['elevenlabs'],
    tts: ['elevenlabs'],
    'speech to text': ['whisper'],
    embeddings: ['embedding', 'vector'],
    'vector database': ['pgvector'],
    sklearn: ['scikit-learn'],
    nextjs: ['next.js'],
    'next js': ['next.js'],
    postgres: ['pgvector'],
    postgresql: ['pgvector'],
  } as Record<string, string[]>,

  /**
   * Topics the site doesn't cover. Asked about these, the assistant says "This
   * site doesn't cover <label>" and points to email instead of guessing. An
   * entry in `faq` overrides these.
   */
  notCovered: [
    { label: 'his education', keys: ['education', 'degree', 'college', 'university', 'graduate', 'graduation', 'btech', 'b tech', 'bachelor', 'masters', 'gpa', 'cgpa', 'studied', 'did he study', 'study at', 'where did he study', 'school', 'qualification'] },
    { label: 'salary expectations', keys: ['salary', 'ctc', 'compensation', 'expected pay', 'pay range', 'hourly rate'] },
    { label: 'his notice period', keys: ['notice period', 'joining date', 'start date', 'when can he start', 'how soon can he', 'start immediately', 'immediate joiner'] },
    { label: 'work-location preferences', keys: ['relocate', 'relocation', 'remote', 'remotely', 'onsite', 'on site', 'hybrid', 'work from home', 'wfh'] },
    { label: 'visa or work-authorisation status', keys: ['visa', 'work permit', 'authorization', 'authorisation', 'sponsorship'] },
    { label: 'certifications', keys: ['certification', 'certificate', 'certified'] },
    { label: 'a phone number', keys: ['phone', 'phone number', 'mobile number', 'whatsapp', 'call him'] },
    { label: 'personal details', keys: ['age', 'old is he', 'married', 'birthday', 'religion', 'hobby', 'hobbies'] },
  ],

  /** Your own questions and answers. They take priority over everything above. */
  faq: [
    // {
    //   ask: ['notice period', 'When can he start?'],
    //   answer: 'Vinayak can join within **30 days**.',
    //   suggestions: ['How can I contact him?'],
    // },
  ] as FaqEntry[],
}
