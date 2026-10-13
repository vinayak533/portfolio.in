/**
 * The chat assistant's own words and knowledge (src/dom/chat). It has no
 * language model: src/core/assistant.ts answers from src/content.ts (what the
 * page shows) plus the knowledge below (what the page doesn't: role details,
 * metrics, more projects, education, achievements), and nothing else. Anything
 * not written here or in content.ts gets "not covered" and the email address.
 *
 * Answers are Markdown: **bold**, *italic*, `code`, lists, ``` fences, links
 * and ![images](https://…) on a line of their own. Links may be https://,
 * mailto:, a section on this page (#about, #works, #experience, #contact) or a
 * project's case study (#work-<project id>).
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

export interface ChatImage {
  alt: string
  src: string
}

export interface Doc {
  label: string
  href: string
}

/** Facts about a project in src/content.ts that its case study doesn't show. */
export interface ProjectExtra {
  /** Shown with the project's overview, after its first sentence. */
  image?: ChatImage
  /** Measured numbers, shown under "At a glance". */
  metrics?: string[]
  /** More of how it works, shown with "how does it work?" and the deep dive. */
  details?: string[]
  /** Stack names beyond the case study's tags. */
  stack?: string[]
  docs?: Doc[]
  /** Listed with the flagship projects. */
  flagship?: boolean
}

/** A project the page doesn't show; the assistant still knows it. */
export interface MoreProject {
  id: string
  title: string
  /** Other names a visitor might use. The title already matches. */
  aliases: string[]
  href: string
  tagline: string
  details?: string[]
  stack: string[]
  year?: string
  /** Listed with the flagship projects. */
  flagship?: boolean
  /** A small app or notebook: named in one line under the project list, not listed in full. */
  minor?: boolean
}

/** A certificate or badge. Its image is shown when a visitor asks about it by name. */
export interface Certification {
  id: string
  title: string
  issuer: string
  /** As printed on the certificate; omitted when it carries none. */
  date?: string
  /** What it covered, in a sentence. */
  covers: string
  /** A same-origin path, from `npm run certs` (public/certs). */
  image: ChatImage
  /** Where it can be checked. Only links that were verified to resolve to Vinayak's certificate. */
  verify?: Doc[]
  /**
   * Words that pick this one out when asked about with "certificate", "badge", "course" and the like:
   * the issuer and the subject. Several certificates sharing the best match are listed together.
   */
  keys: string[]
}

/**
 * A kind of engineering the work shows (the console's /capability). Every project and role listed
 * earns its place with `why`, a fact taken from that project's or role's own text above or in
 * src/content.ts; nothing is listed on inference.
 */
export interface Capability {
  id: string
  title: string
  /** For the relation map. */
  short: string
  /** What it covers, in a sentence. */
  summary: string
  /** Other names a visitor might use ("rag", "multi agent"). The title, short name and id already match. */
  aliases: string[]
  /** Project ids, from src/content.ts or `moreProjects`. */
  projects: { id: string; why: string }[]
  /** Companies, as in src/content.ts experience. */
  roles?: { company: string; why: string }[]
}

/** A project's documented flow, drawn by the console's /arch. Only from the project's own text. */
export interface Architecture {
  /** Project id. */
  project: string
  /** What the drawing shows. */
  title: string
  stages: { label: string; detail?: string }[]
  notes?: string[]
  /** Where it is documented. */
  source: Doc
}

const images = {
  profile: { alt: 'Vinayak K V', src: 'https://avatars.githubusercontent.com/u/215311018?v=4' },
  loom: { alt: 'loom.ai code workspace with live tool trace', src: 'https://github.com/vinayak533/vinayak533/raw/main/assets/svg/screen-loom-dark.svg' },
  lazyhire: { alt: 'lazyhire Career OS', src: 'https://github.com/vinayak533/vinayak533/raw/main/assets/screens/lazyhire-career-os.png' },
  stack: { alt: 'Tech stack', src: 'https://github.com/vinayak533/vinayak533/raw/main/assets/svg/stack-dark.svg' },
} satisfies Record<string, ChatImage>

export const assistant = {
  name: 'Ask Vinayak',
  launcherLabel: 'Ask Vinayak',
  greeting: {
    title: 'Hi, I’m Ask Vinayak',
    body: 'Ask about Vinayak’s projects, experience, skills or how to reach him. I answer only from what I know about his work.',
  },
  /** Shown before the first message. Each must be answerable (scripts/assistant.test.mjs checks). */
  starters: [
    'Who is Vinayak in 30 seconds?',
    'Show me his best project',
    'Why should I hire him?',
    'What’s his LLM/agent experience?',
    'How do I contact him?',
  ],
  placeholder: 'Ask about Vinayak’s work…',
  /** Longest question accepted, in characters. */
  maxLength: 500,

  /**
   * The emoji tag over each answer, by reply topic (src/core/assistant.ts). A prefix ending in ':' covers a
   * family ('project:loom'). Labels only name the topic; they add no facts. Unknown answers use `unknown`.
   */
  topicTags: {
    greeting: ['👋', 'Hello'],
    'how-are-you': ['😊', 'All good'],
    thanks: ['🙏', 'Anytime'],
    bye: ['👋', 'See you'],
    self: ['🤖', 'About this assistant'],
    about: ['👤', 'About Vinayak'],
    'why-hire': ['✨', 'Why hire him'],
    'ai-experience': ['🧠', 'LLM & agents'],
    'current-role': ['💼', 'Current role'],
    experience: ['💼', 'Experience'],
    level: ['📈', 'Experience level'],
    projects: ['🗂️', 'Projects'],
    highlight: ['⭐', 'Best project'],
    'project:': ['🚀', 'Project'],
    'more:': ['🧪', 'Project'],
    compare: ['⚖️', 'Comparison'],
    tech: ['🛠️', 'Tech stack'],
    skills: ['🛠️', 'Skills'],
    links: ['🔗', 'Links'],
    certifications: ['🏅', 'Certifications'],
    'cert:': ['🏅', 'Certificate'],
    achievements: ['🏆', 'Achievements'],
    education: ['🎓', 'Education'],
    contact: ['✉️', 'Contact'],
    resume: ['📄', 'Résumé'],
    availability: ['📅', 'Availability'],
    location: ['📍', 'Location'],
    site: ['🧩', 'This site'],
    more: ['🔍', 'Go deeper'],
    'off-topic': ['🧭', 'Off topic'],
    ack: ['👍', 'Sure'],
    capabilities: ['🧭', 'What I can answer'],
    team: ['🤝', 'Working with others'],
    writing: ['✍️', 'Write-ups'],
    'not-covered:': ['🔒', 'Ask him directly'],
    unknown: ['🤔', 'Not in my notes'],
  } as Record<string, readonly [emoji: string, label: string]>,

  /** What the assistant says about itself when asked whether it is an AI, or whether it is Vinayak. */
  self:
    'I’m an assistant built on Vinayak’s work, not Vinayak himself. I’m scripted rather than a language model: I answer only from what I know about his projects, roles and skills, and when something isn’t covered I say so instead of guessing.',

  /** How this site is built (from package.json and the README). */
  site:
    'This portfolio is a React 19 and TypeScript app built with Vite. The 3D scenes use three.js through React Three Fiber with custom GLSL shaders, scroll choreography runs on GSAP and Lenis, and Tailwind handles layout. The contact form posts to a Vercel Function that delivers mail through Resend.',

  profile: {
    pitch: 'An AI engineer who ships agents that run real tools, answers that cite or abstain, and ML pipelines that still work when the LLM fails.',
    positioning:
      'He builds agent systems, grounded LLM applications and ML pipelines that *show their work*: live tool traces, cited sources, tested guardrails and documented limits.',
    /** The three numbers an introduction leads with. */
    proof: [
      'Cut manual store-audit turnaround by **80%** with a multi-agent LLM pipeline at AMnova',
      'Cut **Loom.ai**’s median time to first token from **8.9 s to 5.0 s** with prompt caching',
      'Ranked **108 of 6,770** in LeetCode Weekly Contest 487, **top 2% globally**',
    ],
    openTo: 'AI/ML and LLM engineering roles',
    workLocations: ['remote', 'Bangalore', 'Kochi', 'Hyderabad'],
  },

  images,

  /** Each role in src/content.ts, by company: where, its one-line headline and the detail. */
  roles: {
    'AMnova Technologies': {
      where: 'Kochi',
      headline: 'Owns the AI/LLM track on a four-person team; his multi-agent LLM pipeline cut manual store-audit turnaround by **80%**.',
      stack: ['Python', 'LangChain', 'FastAPI', 'Supabase', 'Docker', 'AWS', 'GitHub Actions'],
      details: [
        'Owns the AI/LLM track on a four-person team.',
        'Architected and deployed a multi-agent LLM pipeline (Python, LangChain, FastAPI) that cut manual store-audit turnaround by **80%** during early merchant onboarding.',
        'Built a high-throughput FastAPI and Supabase real-time analytics backend to reduce response latency for merchant integrations.',
        'Containerized AI microservices with Docker and automated AWS EC2 deployments with GitHub Actions.',
      ],
    },
    'Amdox Technologies': {
      where: 'Bengaluru',
      headline: 'Retail demand forecasting and churn detection models, deployed as production FastAPI endpoints.',
      stack: ['Python', 'XGBoost', 'scikit-learn', 'FastAPI', 'MLflow', 'Streamlit'],
      details: [
        'Retail demand forecasting and churn detection models with XGBoost and scikit-learn.',
        'Deployed ML pipelines as production FastAPI endpoints to cut inference latency for real-time streaming.',
        'MLflow experiment tracking, and Streamlit dashboards for stakeholders.',
      ],
    },
    'Cognifyz Technologies': {
      where: 'Remote',
      headline: '**95%** classification accuracy on credit-approval models over **280,000+** records.',
      details: [
        '**95%** classification accuracy on credit-approval models over **280,000+** records.',
        'Feature engineering and cleaning on highly skewed data, with class imbalance handled.',
        'Validated on F1, precision, recall and ROC-AUC.',
      ],
    },
  } as Record<string, { where: string; headline: string; details: string[]; /** Technologies its details name. */ stack?: string[] }>,

  /** By project id in src/content.ts. */
  projectExtras: {
    loom: {
      flagship: true,
      image: images.loom,
      // Named in its caption ("eight models from Groq, OpenRouter and OpenCode") and request path ("FastAPI WebSocket").
      stack: ['Groq', 'OpenRouter', 'WebSockets'],
      metrics: [
        'Median time to first token cut from **8.9 s to 5.0 s** on an ~80K-token loop, by serving the transcript from the provider’s prompt cache',
        '**8 models** across Groq, OpenRouter and OpenCode',
        '**10 specialist agents** with human approval',
      ],
      details: [
        'Request path: Next.js trace UI → FastAPI WebSocket → LangGraph → model router with fallback → tools → E2B sandbox.',
        'Routing: each iteration is classified and sent to the model registered for that class; rate limits, quota and 5xx errors retry on up to two alternate providers.',
        'Execution: one typed WebSocket event contract; read-only tool batches run concurrently and writes run in order; graph checkpoints let sessions survive cold starts.',
        'Grounding: notebooks answer only from uploaded sources with `[n]` citations, or say the sources don’t cover it. Retrieval uses lexical hashed vectors, not semantic search.',
      ],
      docs: [
        { label: 'Architecture', href: 'https://github.com/vinayak533/loom.ai/blob/main/docs/architecture.md' },
        { label: 'Performance method', href: 'https://github.com/vinayak533/loom.ai/blob/main/docs/performance.md' },
        { label: 'Known limits', href: 'https://github.com/vinayak533/loom.ai/blob/main/docs/known-limits.md' },
      ],
    },
    lazyhire: {
      flagship: true,
      image: images.lazyhire,
      details: [
        'Pulls from **9 sources** (Technopark, Infopark, UL CyberPark and others), validates apply links, dedupes on canonical URL plus company, title and location, then ranks by freshness, source quality, location, role fit and skills.',
        '**Zero-fabrication CV guardrails:** a tailored CV is rejected if it adds numbers, requirements or changes that can’t be traced to the source CV.',
        'Its assistant answers from an authored knowledge corpus before any optional LLM call.',
        'Security: encrypted CV and account data, per-request CSP nonces, CSRF checks on every mutation, private cache controls, upload scanning and audit events.',
      ],
      stack: ['Next.js 16', 'React 19', 'SQLite + Drizzle', 'Playwright'],
    },
    'bank-churn': {
      metrics: ['**87%+ AUC-ROC** and **85%+ accuracy** on 10,000 customers (5-fold cross-validation)'],
      details: ['XGBoost with SMOTE; Llama 3 70B turns predictions into plain-English risk explanations and ElevenLabs reads them aloud.'],
    },
    predictlab: {
      details: ['Published as a co-authored research preprint on Zenodo (May 2026): multi-disease clinical risk prediction with LLM explainability.'],
    },
  } as Record<string, ProjectExtra>,

  /** Projects the page doesn't show. */
  moreProjects: [
    {
      id: 'inforge',
      title: 'InForge-AI',
      aliases: ['inforge', 'in forge', 'analytics platform', 'multi agent analytics'],
      href: 'https://github.com/vinayak533/InForge-AI',
      tagline: 'A multi-agent analytics platform: 8 pipeline agents turn a CSV or Excel upload into a full analysis with zero manual steps.',
      details: [
        'Pipeline: ingest → clean → EDA → visualize → ML benchmark → insights → code gen → chat.',
        'Deterministic core: pandas, scikit-learn and XGBoost compute every result; LLMs only write explanations, chart strategy, code and chat answers.',
        'Benchmarks 8 ML algorithms across classification, regression and clustering, auto-selected by task type.',
        'Multi-LLM routing (Gemini, Llama 3.3 70B via Groq, OpenRouter models) matched to task type, and **every LLM call has a local fallback**: an outage degrades the prose, never the analysis.',
        'Live per-agent progress over WebSockets, with history replayed for late clients. Outputs: cleaned CSV, charts, models, a PDF report and Python code.',
      ],
      // The last six are named in its details: the deterministic core and the multi-LLM routing.
      stack: ['FastAPI', 'React', 'WebSockets', 'Docker', 'Hugging Face Spaces', 'pandas', 'scikit-learn', 'XGBoost', 'Gemini', 'Groq', 'OpenRouter'],
      year: 'May 2026',
      flagship: true,
    },
    {
      id: 'nl2sql',
      title: 'NL2SQL-AI-Assistant',
      aliases: ['nl2sql', 'nl to sql', 'text to sql', 'sql assistant', 'clinic chatbot'],
      href: 'https://github.com/vinayak533/NL2SQL-AI-Assistant',
      tagline: 'Validated SQL over a clinic database; **18/20** on its own benchmark.',
      details: [
        'Plain-English questions about a clinic database come back as structured results, including charts.',
        'A generated SQLite clinic database (200 patients, 15 doctors, 500 appointments, 350 treatments, 300 invoices) and a Vanna 2.0 agent whose memory is seeded with 20 question-to-SQL pairs.',
        'FastAPI serves `POST /chat` and `GET /health`, with a per-minute rate limit and a query cache.',
        'Scored **18 of 20** on its own benchmark of 20 questions, with the results written up in the repository.',
      ],
      stack: ['Vanna 2.0', 'Gemini', 'FastAPI', 'SQLite'],
      year: 'Mar 2026',
    },
    {
      id: 'battle-arena',
      title: 'llm-battle-arena',
      aliases: ['llm battle arena', 'battle arena', 'llm evaluation', 'llm judge'],
      href: 'https://github.com/vinayak533/llm-battle-arena',
      tagline: 'Two models answer and a third judges, with structured verdicts.',
      details: [
        'Sends one prompt to two Groq-hosted models, then asks a separately configured judge model for a winner and a reason.',
        'The judge follows an explicit rubric: correctness, then completeness, clarity, and safety and best practice.',
        'Verdicts are parsed as JSON with documented fallbacks, so a malformed judgment is reported rather than hidden; the CLI prints both answers, the verdict and running win counts.',
        'A standalone browser demo shows the workflow with fixed example answers; live evaluation runs through the Python CLI.',
      ],
      stack: ['Python', 'LlamaIndex', 'Groq'],
    },
    {
      id: 'insightgenie',
      title: 'InsightGenie',
      aliases: ['insight genie', 'insightgenie data analyzer'],
      href: 'https://github.com/vinayak533/InsightGenie-Data-Analyzer',
      tagline: 'CSV health checks, interactive charts and rule-based ML model recommendations.',
      details: [
        'Upload a CSV and get dataset health (missing cells, duplicates, a quality score), per-column profiles, histograms, category counts, scatter plots and a five-row preview.',
        'A rule-based advisor detects the task (classification, regression or clustering) and explains candidate algorithms with preprocessing and evaluation steps.',
        'Computed locally with pandas and NumPy: no LLM, external AI service or API key. It guides the modelling; it doesn’t train models.',
      ],
      stack: ['FastAPI', 'React', 'pandas', 'NumPy'],
    },
    {
      id: 'stock',
      title: 'Multi-Agent Stock Analysis',
      aliases: ['stock analysis', 'stock', 'trading system'],
      href: 'https://github.com/vinayak533/AI-Multi-Agent-Stock-Analysis-Trading-System',
      tagline: 'Two CrewAI agents turn a Yahoo Finance snapshot into a risk-profile-aware Buy, Sell or Hold rationale.',
      details: [
        'A Financial Market Analyst agent, the only one with the quote tool, pulls price and daily change through yfinance; a Strategic Stock Trader agent turns that analysis into a recommendation.',
        'Ticker, risk tolerance and investment horizon shape both tasks; both agents call Groq through LiteLLM.',
        'Recommendations are text only: no orders are placed. The README is explicit about what the quote tool doesn’t supply (volume, fundamentals, news).',
      ],
      stack: ['CrewAI', 'yfinance', 'Groq', 'LiteLLM', 'Streamlit'],
    },
    {
      id: 'gen-ai-chatbot',
      title: 'Generative AI Chatbot',
      aliases: ['generative ai chatbot', 'groq chatbot', 'langchain chatbot'],
      href: 'https://github.com/vinayak533/generative-ai-chatbot',
      tagline: 'A context-aware chat app on Groq’s Llama 3.3 70B, orchestrated with LangChain.',
      details: ['Streamlit chat interface with conversation context, fast Groq inference, and API keys kept in `.env`.'],
      stack: ['LangChain', 'Groq', 'Llama 3.3 70B', 'Streamlit'],
      year: 'Jan 2026',
    },
    {
      id: 'ollama-chatbot',
      title: 'Ollama Chatbot',
      aliases: ['ollama chatbot', 'ollama', 'local llm', 'gemma'],
      href: 'https://github.com/vinayak533/ollama-chatbot',
      tagline: 'A local LLM chatbot: Gemma 2 (2B) through Ollama, with streamed replies.',
      details: ['Runs the model locally with Ollama and streams each reply into a Streamlit interface that works on desktop and mobile.'],
      stack: ['Ollama', 'Gemma 2', 'Streamlit'],
      year: 'Jan 2026',
    },
    {
      id: 'house-price',
      title: 'House Price Prediction',
      aliases: ['house price', 'house price prediction', 'real estate'],
      href: 'https://github.com/vinayak533/house-price-prediction',
      tagline: 'A serialized scikit-learn pipeline behind a FastAPI service and a Streamlit dashboard.',
      details: [
        'EDA, preprocessing (missing values, encoding, scaling), model comparison with cross-validation and hyperparameter tuning, then one serialized pipeline.',
        'FastAPI serves predictions; a Streamlit dashboard with Plotly gauge charts shows them. GitHub Actions runs CI.',
      ],
      stack: ['scikit-learn', 'FastAPI', 'Streamlit', 'Plotly', 'GitHub Actions'],
      year: 'Feb 2026',
    },
    {
      id: 'insurance-cicd',
      title: 'Medical Insurance Cost Prediction (CI/CD)',
      aliases: ['medical insurance', 'insurance', 'insurance cost', 'insurance prediction', 'ci cd project'],
      href: 'https://github.com/vinayak533/medical-insurance-cost-prediction-ci-cd',
      tagline: 'A regression model shipped as a Dockerized Streamlit app with a full CI/CD pipeline.',
      details: [
        'Predicts insurance cost from age, BMI, children, smoking and region.',
        'On every push, GitHub Actions runs the unit tests, builds the Docker image and deploys it.',
      ],
      stack: ['scikit-learn', 'Streamlit', 'Docker', 'GitHub Actions'],
      year: 'Nov 2025',
    },
    {
      id: 'rainfall',
      title: 'Rainfall Prediction App',
      aliases: ['rainfall', 'rainfall prediction', 'weather prediction'],
      href: 'https://github.com/vinayak533/Rainfall-Prediction-App',
      tagline: 'A Random Forest rainfall classifier, Dockerized and deployed to Render.',
      details: [
        'Weather readings in, rain or no rain out, from a pre-trained Random Forest behind a Streamlit form.',
        'Containerized with Docker, built with GitHub Actions and deployed on Render. The modelling lives in a [companion notebook](https://github.com/vinayak533/Rainfall-Prediction-ML).',
      ],
      stack: ['scikit-learn', 'Streamlit', 'Docker', 'GitHub Actions', 'Render'],
      year: 'Feb 2026',
    },
    {
      id: 'heart-app',
      title: 'Heart Disease Prediction App',
      aliases: ['heart disease', 'heart disease app', 'heart disease prediction', 'svm'],
      href: 'https://github.com/vinayak533/heart-disease-prediction-ml-app',
      tagline: 'An SVM heart-disease risk model, deployed on Streamlit Cloud.',
      details: [
        'Class imbalance handled; Logistic Regression and SVM compared on accuracy, precision, recall and F1, with SVM chosen.',
        'The exploratory work is in a [separate notebook](https://github.com/vinayak533/heart-disease-prediction).',
      ],
      stack: ['scikit-learn', 'SVM', 'Streamlit'],
      year: 'Nov 2025',
      minor: true,
    },
    {
      id: 'face-mask',
      title: 'Face Mask Detection',
      aliases: ['face mask', 'mask detection', 'cnn'],
      href: 'https://github.com/vinayak533/Face-Mask-Detection-CNN',
      tagline: 'A CNN that classifies faces as mask or no mask.',
      details: ['Images are resized and normalized with OpenCV and NumPy, then a TensorFlow/Keras CNN with dropout is trained with a validation split.'],
      stack: ['TensorFlow', 'Keras', 'OpenCV', 'CNN'],
      year: 'Feb 2026',
      minor: true,
    },
    {
      id: 'spam',
      title: 'Spam Mail Detection',
      aliases: ['spam', 'spam mail', 'spam detection'],
      href: 'https://github.com/vinayak533/Spam-Mail-Detection-App',
      tagline: 'Multinomial Naive Bayes over TF-IDF features, behind a Streamlit app.',
      details: ['Text is cleaned and tokenized, vectorized with TF-IDF and classified as spam or not spam in real time.'],
      stack: ['NLP', 'TF-IDF', 'Naive Bayes', 'Streamlit'],
      year: 'Feb 2026',
      minor: true,
    },
    {
      id: 'movies',
      title: 'Movie Recommendation System',
      aliases: ['movie recommendation', 'movie recommender', 'recommendation system', 'recommender'],
      href: 'https://github.com/vinayak533/movie-recommendation-system',
      tagline: 'Content-based (TF-IDF and cosine similarity) and collaborative-filtering movie recommendations.',
      stack: ['scikit-learn', 'pandas'],
      year: 'Aug 2025',
      minor: true,
    },
    {
      id: 'calories',
      title: 'Calories Burnt Prediction',
      aliases: ['calories', 'calories burnt', 'calorie prediction'],
      href: 'https://github.com/vinayak533/calories-burnt-prediction-ml-model',
      tagline: 'An XGBoost regressor reaching **R² 0.9987** (MAE 1.51) on its test data.',
      stack: ['XGBoost', 'pandas', 'Seaborn'],
      year: 'Dec 2025',
      minor: true,
    },
    {
      id: 'digits',
      title: 'Handwritten Digit Recognition',
      aliases: ['handwritten digit', 'digit recognition', 'mnist'],
      href: 'https://github.com/vinayak533/handwritten-digit-recognition',
      tagline: 'A TensorFlow/Keras neural network classifying MNIST digits.',
      stack: ['TensorFlow', 'Keras'],
      year: 'Jul 2025',
      minor: true,
    },
    {
      id: 'ml-notebooks',
      title: 'Applied ML notebooks',
      aliases: [
        'notebooks', 'ml notebooks', 'beginner projects', 'small projects', 'classic ml',
        'titanic', 'loan status', 'loan prediction', 'credit card approval', 'diabetes', 'pima', 'parkinson', 'sonar',
        'gold price', 'big mart', 'medical cost', 'gpa', 'iris', 'k means', 'kmeans',
      ],
      href: 'https://github.com/vinayak533?tab=repositories',
      tagline: 'A dozen end-to-end notebooks on classic datasets: EDA, preprocessing, model training and evaluation.',
      details: [
        'Classification: [Titanic survival](https://github.com/vinayak533/titanic-survival-prediction), [loan status](https://github.com/vinayak533/loan-status-prediction), [credit card approval](https://github.com/vinayak533/credit-card-approval-prediction), [Pima diabetes](https://github.com/vinayak533/Pima-Diabetes-Prediction), [Parkinson’s disease](https://github.com/vinayak533/parkinson-s-disease-prediction) and [sonar mine vs rock](https://github.com/vinayak533/sonar-object-classification).',
        'Regression: [gold price](https://github.com/vinayak533/Gold-Price-Prediction), [Big Mart sales](https://github.com/vinayak533/big-mart-sales-prediction), [medical cost](https://github.com/vinayak533/medical-cost-prediction) and [student GPA](https://github.com/vinayak533/GPA-Prediction-Using-Multiple-Linear-Regression-in-Python) (multiple linear regression with statsmodels).',
        'Clustering: [K-Means on Iris](https://github.com/vinayak533/iris-clustering-kmeans).',
      ],
      stack: ['scikit-learn', 'pandas', 'Seaborn', 'statsmodels'],
      year: '2025',
      minor: true,
    },
  ] as MoreProject[],

  repos: { count: 37, href: 'https://github.com/vinayak533?tab=repositories' },

  achievements: [
    '**LeetCode Weekly Contest 487** (Jan 2026): ranked **108 of 6,770**, top 2% globally.',
    '**HackerRank Orchestrate Hackathon** (May 2026) **finalist**: built a terminal-based autonomous support-triage agent integrating HackerRank, Claude and Visa APIs.',
    '**Research:** co-authored the PredictLab preprint (Zenodo, May 2026) on multi-disease clinical risk prediction with LLM explainability.',
    '**10 certifications** from Anthropic, AWS, IBM, HackerRank, Kaggle, OpenAI Academy and Tata (Forage), including HackerRank **SQL (Advanced)** and IBM’s advanced **Deep Learning using TensorFlow** badge.',
  ],

  /** Newest first. Images come from `npm run certs`. */
  certifications: [
    {
      id: 'anthropic-ai-fluency',
      title: 'AI Fluency: Framework & Foundations',
      issuer: 'Anthropic',
      date: '2026',
      covers: 'Anthropic’s course on collaborating with AI effectively, efficiently, ethically and safely.',
      image: { alt: 'Anthropic AI Fluency: Framework & Foundations certificate of completion', src: '/certs/anthropic-ai-fluency.webp' },
      keys: ['anthropic', 'ai fluency', 'fluency', 'claude'],
    },
    {
      id: 'aws-genai',
      title: 'Introduction to Generative AI: Art of the Possible',
      issuer: 'AWS Training & Certification',
      date: 'Jan 2026',
      covers: 'AWS’s introductory course on generative AI and its use cases.',
      image: { alt: 'AWS Introduction to Generative AI: Art of the Possible completion certificate', src: '/certs/aws-genai.webp' },
      keys: ['aws', 'amazon', 'generative ai', 'gen ai', 'genai', 'art of the possible'],
    },
    {
      id: 'hackerrank-sql-advanced',
      title: 'SQL (Advanced)',
      issuer: 'HackerRank',
      date: 'Jan 2026',
      covers: 'Passed HackerRank’s advanced SQL skill certification test.',
      image: { alt: 'HackerRank SQL (Advanced) certificate of accomplishment', src: '/certs/hackerrank-sql-advanced.webp' },
      verify: [{ label: 'Verify on HackerRank', href: 'https://www.hackerrank.com/certificates/17e9b0651b11' }],
      keys: ['hackerrank', 'sql', 'sql advanced', 'advanced sql'],
    },
    {
      id: 'kaggle-python-coder',
      title: 'Python Coder',
      issuer: 'Kaggle',
      date: 'Oct 2025',
      covers: 'Kaggle’s Python Coder badge.',
      image: { alt: 'Kaggle Python Coder badge certificate', src: '/certs/kaggle-python-coder.webp' },
      keys: ['kaggle', 'python coder', 'python'],
    },
    {
      id: 'ibm-deep-learning-tensorflow',
      title: 'Deep Learning using TensorFlow',
      issuer: 'IBM (Skills Network, Advanced badge)',
      date: 'Aug 2025',
      covers: 'IBM’s advanced-level deep learning course (ML0120EN) on TensorFlow, with both the course certificate and the Credly badge.',
      image: { alt: 'IBM Deep Learning using TensorFlow credential', src: '/certs/ibm-deep-learning-tensorflow.webp' },
      verify: [
        { label: 'Credly badge', href: 'https://www.credly.com/badges/a92bec3a-79f6-403b-8742-562d2e53aa02' },
        { label: 'Course certificate', href: 'https://courses.cognitiveclass.ai/certificates/ae662d0d5bcd491a8c3dfa8b774cc236' },
      ],
      keys: ['ibm', 'tensorflow', 'deep learning', 'credly', 'cognitive class'],
    },
    {
      id: 'tata-data-visualisation',
      title: 'Data Visualisation: Empowering Business with Effective Insights',
      issuer: 'Tata (Forage job simulation)',
      date: 'Aug 2025',
      covers: 'Practical tasks: framing the business scenario, choosing the right visuals, creating effective visuals, and communicating insights and analysis.',
      image: { alt: 'Tata and Forage Data Visualisation certificate of completion', src: '/certs/tata-data-visualisation.webp' },
      keys: ['tata', 'forage', 'data visualisation', 'data visualization', 'visualisation', 'visualization', 'job simulation'],
    },
    {
      id: 'ibm-machine-learning-python',
      title: 'Machine Learning with Python',
      issuer: 'IBM (Cognitive Class)',
      date: 'Aug 2025',
      covers: 'IBM’s ML0101EN course, passed with a grade.',
      image: { alt: 'IBM Machine Learning with Python certificate', src: '/certs/ibm-machine-learning-python.webp' },
      verify: [{ label: 'Verify on Cognitive Class', href: 'https://courses.cognitiveclass.ai/certificates/1e365c0c208f4ee7bbd9aebe677bd782' }],
      keys: ['ibm', 'machine learning', 'ml', 'python', 'cognitive class'],
    },
    {
      id: 'ibm-data-analysis-python',
      title: 'Data Analysis with Python',
      issuer: 'IBM (Cognitive Class)',
      date: 'Jul 2025',
      covers: 'IBM’s DA0101EN course, passed with a grade.',
      image: { alt: 'IBM Data Analysis with Python certificate', src: '/certs/ibm-data-analysis-python.webp' },
      verify: [{ label: 'Verify on Cognitive Class', href: 'https://courses.cognitiveclass.ai/certificates/aa6ab3dc47ac469c8e7f3936d13c176d' }],
      keys: ['ibm', 'data analysis', 'python', 'cognitive class'],
    },
    {
      id: 'ibm-sql-databases',
      title: 'SQL and Relational Databases 101',
      issuer: 'IBM (Cognitive Class)',
      date: 'Jul 2025',
      covers: 'IBM’s DB0101EN course, passed with a grade.',
      image: { alt: 'IBM SQL and Relational Databases 101 certificate', src: '/certs/ibm-sql-databases.webp' },
      verify: [{ label: 'Verify on Cognitive Class', href: 'https://courses.cognitiveclass.ai/certificates/0c4dab85dd1c436f92ef61d3862af9d7' }],
      keys: ['ibm', 'sql', 'relational database', 'database', 'cognitive class'],
    },
    {
      id: 'openai-agents-workflows',
      title: 'Agents and Workflows',
      issuer: 'OpenAI Academy',
      covers: 'OpenAI Academy’s Agents and Workflows badge.',
      image: { alt: 'OpenAI Academy Agents and Workflows badge', src: '/certs/openai-agents-workflows.webp' },
      keys: ['openai', 'open ai', 'openai academy', 'agents and workflows', 'agent', 'workflow'],
    },
  ] as Certification[],

  education: [
    '**BCA**, Mahatma Gandhi University, Kerala (2022 – 2025)',
    '**Advanced Data Science & AI** (7 months), Avodha Centre for IT Education, NSDC and Skill India accredited (Sep 2025 – Mar 2026)',
  ],

  /** Skills, grouped. "Does he know X?" also searches these. */
  skillGroups: [
    { label: 'Languages', items: ['Python', 'TypeScript', 'Java', 'C', 'C++'] },
    {
      label: 'LLMs and agents',
      items: ['LangGraph', 'LangChain', 'CrewAI', 'LlamaIndex', 'Vanna 2.0', 'OpenAI SDK', 'RAG', 'multi-agent orchestration', 'model routing with fallback', 'prompt caching', 'Hugging Face', 'Ollama'],
    },
    { label: 'Model APIs', items: ['Groq', 'Gemini', 'OpenRouter'] },
    { label: 'Machine learning', items: ['PyTorch', 'TensorFlow', 'Keras', 'scikit-learn', 'XGBoost', 'NLP', 'OpenCV', 'recommender systems', 'feature engineering', 'EDA', 'statistics', 'statsmodels'] },
    { label: 'Backend', items: ['FastAPI', 'WebSockets', 'Pydantic', 'REST APIs'] },
    { label: 'Frontend', items: ['Next.js', 'React', 'Tailwind CSS'] },
    { label: 'Data', items: ['SQL', 'PostgreSQL', 'Supabase', 'pgvector', 'MongoDB', 'SQLite', 'Drizzle'] },
    { label: 'Cloud and MLOps', items: ['AWS (EC2, S3, SageMaker, Lambda)', 'Docker', 'MLflow', 'GitHub Actions', 'E2B', 'Vercel', 'Render', 'Playwright'] },
    { label: 'Data viz and apps', items: ['pandas', 'NumPy', 'Matplotlib', 'Seaborn', 'Plotly', 'Streamlit', 'Gradio', 'Power BI'] },
  ],

  /**
   * Extra names a visitor might use for a project, by project id. The title and
   * id already match on their own.
   */
  projectAliases: {
    loom: ['loom', 'loom ai'],
    lazyhire: ['lazy hire'],
    'bank-churn': ['aria', 'churn', 'churn prediction app', 'bank'],
    health: ['ai doctor', 'medical assistant', 'voice assistant', 'medical voice'],
    predictlab: ['predict lab', 'predict ai', 'predictai'],
  } as Record<string, string[]>,

  /**
   * When a visitor asks whether he knows something, these broaden the search
   * through what the assistant knows (e.g. "RAG" is described as retrieval).
   */
  techSynonyms: {
    rag: ['rag', 'retrieval', 'pgvector', 'cited'],
    'retrieval augmented generation': ['rag', 'retrieval', 'pgvector', 'cited'],
    llm: ['llm', 'llama', 'langgraph'],
    llms: ['llm', 'llama', 'langgraph'],
    'large language model': ['llm', 'llama'],
    agent: ['agent'],
    'machine learning': ['xgboost', 'scikit-learn', 'classifier'],
    ml: ['xgboost', 'scikit-learn', 'classifier'],
    'deep learning': ['pytorch', 'tensorflow', 'cnn'],
    'computer vision': ['vision', 'cnn', 'image classifier'],
    speech: ['whisper', 'elevenlabs', 'voice'],
    'text to speech': ['elevenlabs'],
    tts: ['elevenlabs'],
    'speech to text': ['whisper'],
    embeddings: ['embedding', 'vector'],
    'vector database': ['pgvector'],
    sklearn: ['scikit-learn'],
    nextjs: ['next.js'],
    'next js': ['next.js'],
    postgres: ['postgresql', 'pgvector'],
    aws: ['aws', 'ec2'],
    'ci cd': ['github actions'],
    mlops: ['mlflow', 'docker', 'github actions'],
    sql: ['sql', 'postgresql', 'sqlite'],
    nlp: ['nlp', 'tf-idf', 'text'],
    'natural language processing': ['nlp', 'tf-idf'],
    'data visualization': ['visualisation', 'plotly', 'power bi'],
    'data visualisation': ['visualisation', 'plotly', 'power bi'],
    'recommendation system': ['recommendation', 'recommender'],
    'local llm': ['ollama'],
  } as Record<string, string[]>,

  /**
   * For a skill he doesn't list, the closest one he does, so the honest "no"
   * still points somewhere useful.
   */
  relatedSkills: {
    kubernetes: 'Docker',
    k8s: 'Docker',
    terraform: 'AWS',
    gcp: 'AWS',
    'google cloud': 'AWS',
    azure: 'AWS',
    django: 'FastAPI',
    flask: 'FastAPI',
    vue: 'React',
    angular: 'React',
    svelte: 'React',
    jax: 'PyTorch',
    mysql: 'SQL and PostgreSQL',
    pinecone: 'pgvector',
    weaviate: 'pgvector',
    chroma: 'pgvector',
    chromadb: 'pgvector',
    qdrant: 'pgvector',
    faiss: 'pgvector',
    autogen: 'CrewAI',
    'semantic kernel': 'LangChain',
    tableau: 'Power BI',
    spark: 'pandas',
    pyspark: 'pandas',
  } as Record<string, string>,

  /**
   * Topics the assistant won't answer. `direct` ones are things Vinayak prefers
   * to discuss himself; the rest simply aren't covered. Both point to email. An
   * entry in `faq` overrides these.
   */
  notCovered: [
    { label: 'salary', direct: true, keys: ['salary', 'ctc', 'compensation', 'expected pay', 'pay range', 'hourly rate', 'current pay', 'salary package'] },
    { label: 'notice period', direct: true, keys: ['notice period', 'joining date', 'start date', 'when can he start', 'how soon can he', 'start immediately', 'immediate joiner', 'when can he join', 'can he join', 'joining', 'how soon', 'serve notice', 'last working day'] },
    { label: 'phone number', direct: true, keys: ['phone', 'phone number', 'mobile number', 'whatsapp', 'call him'] },
    { label: 'home address', direct: true, keys: ['address', 'home address', 'house address', 'street address'] },
    { label: 'academic grades', keys: ['cgpa', 'gpa', 'sgpa', 'marks', 'grade', 'grades', 'percentage', 'class rank', 'backlogs', 'arrears'] },
    { label: 'weaknesses', keys: ['weakness', 'weaknesses', 'weak point', 'weak points', 'flaw', 'flaws', 'areas to improve', 'area of improvement', 'shortcoming', 'shortcomings'] },
    { label: 'spoken languages', keys: ['speak', 'spoken language', 'spoken languages', 'mother tongue', 'native language', 'hindi', 'malayalam', 'tamil', 'kannada', 'telugu', 'english fluency'] },
    { label: 'fine-tuning work', keys: ['fine tuning', 'fine tune', 'fine tuned', 'finetuning', 'finetune', 'lora', 'qlora', 'peft', 'rlhf'] },
    { label: 'visa or work-authorisation status', keys: ['visa', 'work permit', 'authorization', 'authorisation', 'sponsorship'] },
    // Tastes too ("his favourite food" is not his favourite project). Not 'movie': a project recommends movies.
    { label: 'personal details', keys: ['age', 'old is he', 'date of birth', 'dob', 'born', 'birth date', 'married', 'birthday', 'religion', 'hobby', 'hobbies', 'food', 'pizza', 'topping', 'cuisine', 'dish', 'drink', 'song', 'music', 'colour', 'color', 'sport', 'sports', 'cricket', 'football', 'girlfriend'] },
  ] as { label: string; direct?: boolean; keys: string[] }[],

  /* ------------------------------------------------------------------ console */
  /*
   * The console (src/dom/chat, engine in src/core/console.ts and src/core/graph.ts) reads the
   * knowledge above as a graph: projects, technologies, capabilities and roles. A technology node is
   * every tag in content.ts, every `stack` entry above and every skill, under its canonical name.
   */

  /** Shown on the console's first screen. */
  console: {
    kicker: 'Index 00 · Discovery',
    statement: ['Query', 'the work.'],
    lede: 'A queryable index of Vinayak’s engineering: projects, the technologies behind them, the capabilities they show and the roles that used them, all connected.',
    /** Entry points (commands) and example questions. Each must resolve (scripts/console.test.mjs checks). */
    entry: ['/agents', '/projects', '/stack', '/contact'],
    examples: ['How does Loom.ai work?', 'Does he know Docker?', 'Why should I hire him?'],
    placeholder: 'Ask a question, or type / for commands',
  },

  /** Short names for the relation map, by project id. Others use their title. */
  mapNames: {
    'bank-churn': 'Bank Churn',
    health: 'Health Assistant',
    inforge: 'InForge-AI',
    nl2sql: 'NL2SQL',
    'battle-arena': 'LLM Battle Arena',
    stock: 'Stock Agents',
    'gen-ai-chatbot': 'GenAI Chatbot',
    'ollama-chatbot': 'Ollama Chatbot',
    'house-price': 'House Price',
    'insurance-cicd': 'Insurance CI/CD',
    rainfall: 'Rainfall',
  } as Record<string, string>,

  /** A tag as a project writes it → the technologies it names. Tags not listed are their own name. */
  techCanon: {
    'Next.js 16': ['Next.js'],
    'React 19': ['React'],
    'SQLite + FTS5': ['SQLite'],
    'SQLite + Drizzle': ['SQLite', 'Drizzle'],
    'E2B sandbox': ['E2B'],
    'Hugging Face Spaces': ['Hugging Face'],
    'Llama 3.3 70B': ['Llama'],
    'Llama 3.1': ['Llama'],
    'Llama 4 Scout': ['Llama'],
    'Whisper large-v3': ['Whisper'],
    'Gemma 2': ['Gemma'],
    'AWS (EC2, S3, SageMaker, Lambda)': ['AWS'],
  } as Record<string, string[]>,

  /** Skills that are capabilities rather than technologies: they open that capability. */
  skillCapabilities: {
    RAG: 'grounded',
    'multi-agent orchestration': 'agents',
    'model routing with fallback': 'routing',
    'prompt caching': 'routing',
  } as Record<string, string>,

  /** Groups for technologies no skill group lists. */
  techGroups: {
    Llama: 'Models',
    Whisper: 'Models',
    Gemma: 'Models',
    'MiniLM embeddings': 'Models',
    ElevenLabs: 'Model APIs',
    LiteLLM: 'LLMs and agents',
    SMOTE: 'Machine learning',
    SVM: 'Machine learning',
    CNN: 'Machine learning',
    'TF-IDF': 'Machine learning',
    'Naive Bayes': 'Machine learning',
    yfinance: 'Data',
  } as Record<string, string>,

  /** Other names for technologies, by canonical name. */
  techAliases: {
    'scikit-learn': ['sklearn', 'scikit'],
    'Next.js': ['nextjs', 'next'],
    'Hugging Face': ['huggingface', 'hf', 'hugging face spaces'],
    'GitHub Actions': ['gh actions', 'github action', 'ci cd', 'cicd'],
    WebSockets: ['websocket', 'ws'],
    Llama: ['llama 3', 'llama 3.3', 'llama 3.1', 'llama 4', 'meta llama'],
    PostgreSQL: ['postgres'],
    TypeScript: ['ts'],
    'OpenAI SDK': ['openai'],
    ElevenLabs: ['eleven labs', 'text to speech', 'tts'],
    Whisper: ['speech to text', 'stt'],
    pandas: ['panda'],
  } as Record<string, string[]>,

  capabilities: [
    {
      id: 'agents',
      title: 'Agent orchestration',
      short: 'Agents',
      summary: 'LLM systems where agents split a task, call real tools and hand work to one another.',
      aliases: ['agent', 'multi agent', 'agentic', 'orchestration', 'agent systems', 'multi-agent orchestration', 'tool use', 'tool calling', 'autonomous agents'],
      projects: [
        { id: 'loom', why: 'Ten specialist agents with human approval, and a Code agent working in a real E2B Linux sandbox, on one FastAPI and LangGraph backend.' },
        { id: 'inforge', why: 'Eight pipeline agents turn a CSV or Excel upload into a full analysis with zero manual steps.' },
        { id: 'stock', why: 'Two CrewAI agents: a Market Analyst holding the quote tool, and a Trader that turns its analysis into a Buy, Sell or Hold rationale.' },
        { id: 'nl2sql', why: 'A Vanna 2.0 agent, its memory seeded with 20 question-to-SQL pairs, answers plain-English questions over a clinic database.' },
      ],
      roles: [{ company: 'AMnova Technologies', why: 'Architected and deployed a multi-agent LLM pipeline (Python, LangChain, FastAPI) that cut manual store-audit turnaround by **80%**.' }],
    },
    {
      id: 'grounded',
      title: 'Grounded answers & guardrails',
      short: 'Grounding',
      summary: 'LLM output that must trace back to a source: cited answers, abstaining when the sources don’t cover it, and edits rejected when they can’t be traced.',
      aliases: ['rag', 'retrieval', 'retrieval augmented generation', 'grounding', 'citations', 'cited answers', 'guardrails', 'hallucination', 'fabrication'],
      projects: [
        { id: 'loom', why: 'Learn notebooks answer only from uploaded sources with `[n]` citations, or say the sources don’t cover it.' },
        { id: 'lazyhire', why: 'Zero-fabrication CV guardrails: a tailored CV is rejected if it adds numbers, requirements or changes that can’t be traced to the source CV.' },
      ],
    },
    {
      id: 'routing',
      title: 'Model routing & fallback',
      short: 'Routing',
      summary: 'Sending each LLM call to the right model, surviving provider failures, and measuring the latency.',
      aliases: ['model routing', 'model router', 'fallback', 'provider fallback', 'prompt caching', 'caching', 'latency', 'resilience', 'model routing with fallback'],
      projects: [
        { id: 'loom', why: 'Each turn routes across eight models from Groq, OpenRouter and OpenCode; rate limits, quota and 5xx errors retry on up to two alternate providers. Prompt caching cut median time to first token from **8.9 s to 5.0 s**.' },
        { id: 'inforge', why: 'Multi-LLM routing (Gemini, Llama 3.3 70B via Groq, OpenRouter models) matched to task type, and every LLM call has a local fallback: an outage degrades the prose, never the analysis.' },
      ],
    },
    {
      id: 'explain',
      title: 'ML with LLM explanations',
      short: 'Explainable ML',
      summary: 'A trained model makes the prediction; an LLM explains it in plain language.',
      aliases: ['explainability', 'explainable ai', 'xai', 'explainable ml', 'llm explanations', 'interpretability'],
      projects: [
        { id: 'bank-churn', why: 'An XGBoost classifier scores churn risk; Llama 3.3 70B on Groq explains each result and ElevenLabs reads it aloud.' },
        { id: 'predictlab', why: 'Three scikit-learn classifiers screen for diabetes, stroke and heart disease; Llama 3.1 on Groq explains each result.' },
        { id: 'inforge', why: 'pandas, scikit-learn and XGBoost compute every result; LLMs only write explanations, chart strategy, code and chat answers.' },
      ],
    },
    {
      id: 'classic-ml',
      title: 'Classical machine learning',
      short: 'Classic ML',
      summary: 'Supervised and unsupervised models with feature engineering, class-imbalance handling and cross-validation.',
      aliases: ['machine learning', 'ml', 'classical ml', 'supervised learning', 'classification', 'regression', 'predictive modeling', 'predictive modelling', 'data science'],
      projects: [
        { id: 'bank-churn', why: 'XGBoost with SMOTE on 10,000 customers: **87%+ AUC-ROC** and **85%+ accuracy** under 5-fold cross-validation.' },
        { id: 'predictlab', why: 'SVM for diabetes, Random Forest for stroke and Logistic Regression for heart disease.' },
        { id: 'house-price', why: 'Model comparison with cross-validation and hyperparameter tuning, shipped as one serialized scikit-learn pipeline.' },
        { id: 'calories', why: 'An XGBoost regressor reaching **R² 0.9987** (MAE 1.51) on its test data.' },
        { id: 'spam', why: 'Multinomial Naive Bayes over TF-IDF features.' },
        { id: 'movies', why: 'Content-based (TF-IDF and cosine similarity) and collaborative-filtering recommendations.' },
        { id: 'ml-notebooks', why: 'A dozen end-to-end notebooks on classic datasets: classification, regression and clustering.' },
      ],
      roles: [
        { company: 'Amdox Technologies', why: 'Retail demand forecasting and churn detection models with XGBoost and scikit-learn.' },
        { company: 'Cognifyz Technologies', why: '**95%** classification accuracy on credit-approval models over **280,000+** records.' },
      ],
    },
    {
      id: 'voice-vision',
      title: 'Speech, vision & deep learning',
      short: 'Voice + vision',
      summary: 'Models that hear, see and speak: speech-to-text, a vision LLM, text-to-speech and CNNs.',
      aliases: ['speech', 'voice', 'vision', 'computer vision', 'deep learning', 'multimodal', 'neural network', 'neural networks'],
      projects: [
        { id: 'health', why: 'Whisper large-v3 transcribes a spoken question, Llama 4 Scout reads it with a medical image, and ElevenLabs speaks the reply. Extends an open-source project.' },
        { id: 'bank-churn', why: 'ElevenLabs reads each churn explanation aloud.' },
        { id: 'face-mask', why: 'A TensorFlow/Keras CNN classifies faces as mask or no mask.' },
        { id: 'digits', why: 'A TensorFlow/Keras neural network classifies MNIST digits.' },
      ],
    },
    {
      id: 'mlops',
      title: 'Shipping ML to production',
      short: 'MLOps',
      summary: 'Models behind APIs, in containers, with CI/CD and hosted demos.',
      aliases: ['deployment', 'deploy', 'devops', 'production ml', 'model serving', 'serving', 'containers', 'containerization'],
      projects: [
        { id: 'predictlab', why: 'One FastAPI service serves the pages, the prediction endpoints and the assistant; Dockerized and on Hugging Face Spaces.' },
        { id: 'insurance-cicd', why: 'On every push, GitHub Actions runs the unit tests, builds the Docker image and deploys it.' },
        { id: 'rainfall', why: 'Containerized with Docker, built with GitHub Actions and deployed on Render.' },
        { id: 'house-price', why: 'FastAPI serves predictions; GitHub Actions runs CI.' },
      ],
      roles: [
        { company: 'AMnova Technologies', why: 'Containerized AI microservices with Docker and automated AWS EC2 deployments with GitHub Actions.' },
        { company: 'Amdox Technologies', why: 'Deployed ML pipelines as production FastAPI endpoints, with MLflow experiment tracking.' },
      ],
    },
    {
      id: 'evaluation',
      title: 'LLM evaluation & benchmarks',
      short: 'Evaluation',
      summary: 'Measuring LLM systems instead of trusting them: judges with rubrics, benchmarks and a documented latency method.',
      aliases: ['evals', 'eval', 'llm evaluation', 'benchmark', 'llm as judge', 'llm judge', 'judge'],
      projects: [
        { id: 'battle-arena', why: 'Two models answer and a third judges against an explicit rubric; a malformed verdict is reported rather than hidden.' },
        { id: 'nl2sql', why: 'Scored **18 of 20** on its own benchmark of 20 questions, with the results written up in the repository.' },
        { id: 'loom', why: 'Median time to first token measured on an ~80K-token loop, with the method documented.' },
      ],
    },
  ] as Capability[],

  /** Documented flows, drawn by /arch. Each stage is in the project's own text above or in content.ts. */
  architectures: [
    {
      project: 'loom',
      title: 'Request path',
      stages: [
        { label: 'Next.js trace UI', detail: 'Streams every tool call into a live trace and preview.' },
        { label: 'FastAPI WebSocket', detail: 'One typed WebSocket event contract.' },
        { label: 'LangGraph', detail: 'Graph checkpoints let sessions survive cold starts.' },
        { label: 'Model router with fallback', detail: 'Each iteration is classified and sent to its model; rate limits, quota and 5xx errors retry on up to two alternate providers.' },
        { label: 'Tools', detail: 'Read-only tool batches run concurrently; writes run in order.' },
        { label: 'E2B sandbox', detail: 'A real Linux sandbox: shell, files, web search, dev servers.' },
      ],
      notes: [
        'Prompt caching cut median time to first token from **8.9 s to 5.0 s** on an ~80K-token loop.',
        'Notebook retrieval uses lexical hashed vectors stored in pgvector, not semantic search.',
      ],
      source: { label: 'Architecture doc', href: 'https://github.com/vinayak533/loom.ai/blob/main/docs/architecture.md' },
    },
    {
      project: 'inforge',
      title: 'Agent pipeline',
      stages: [
        { label: 'Ingest', detail: 'A CSV or Excel upload.' },
        { label: 'Clean' },
        { label: 'EDA' },
        { label: 'Visualize' },
        { label: 'ML benchmark', detail: '8 algorithms across classification, regression and clustering, auto-selected by task type.' },
        { label: 'Insights' },
        { label: 'Code gen' },
        { label: 'Chat' },
      ],
      notes: [
        'Deterministic core: pandas, scikit-learn and XGBoost compute every result; LLMs only write explanations, chart strategy, code and chat answers.',
        'Every LLM call has a local fallback. Live per-agent progress streams over WebSockets.',
      ],
      source: { label: 'Repository', href: 'https://github.com/vinayak533/InForge-AI' },
    },
    {
      project: 'lazyhire',
      title: 'Search and tailoring',
      stages: [
        { label: '9 job sources', detail: 'Technopark, Infopark, UL CyberPark and others.' },
        { label: 'Validate apply links' },
        { label: 'Dedupe', detail: 'On canonical URL plus company, title and location.' },
        { label: 'Rank', detail: 'Freshness, source quality, location, role fit and skills; every score can be inspected.' },
        { label: 'Guarded CV tailoring', detail: 'Rejected if it adds numbers, requirements or changes that can’t be traced to the source CV.' },
      ],
      source: { label: 'Repository', href: 'https://github.com/vinayak533/lazyhire' },
    },
    {
      project: 'bank-churn',
      title: 'Prediction to explanation',
      stages: [
        { label: 'Customer profile' },
        { label: 'XGBoost classifier', detail: 'Trained on 10,000 records with SMOTE; one scaler shared by training and inference.' },
        { label: 'FastAPI', detail: 'Returns the churn probability and a low / medium / high tier.' },
        { label: 'Llama 3.3 70B on Groq', detail: 'Explains the result in plain language.' },
        { label: 'ElevenLabs', detail: 'Reads it aloud.' },
      ],
      source: { label: 'Repository', href: 'https://github.com/vinayak533/bank-churn-intelligence-platform' },
    },
    {
      project: 'health',
      title: 'Voice and vision flow',
      stages: [
        { label: 'Browser recording', detail: 'Empty recordings are rejected before any API call.' },
        { label: 'Whisper large-v3 on Groq', detail: 'Transcribes the question.' },
        { label: 'Llama 4 Scout', detail: 'Reasons over the transcript and the uploaded image together.' },
        { label: 'ElevenLabs', detail: 'Speaks the reply.' },
      ],
      notes: ['Extends the open-source AI Doctor 2.0 demo by AIwithHassan. A learning project, not a clinical tool.'],
      source: { label: 'Repository', href: 'https://github.com/vinayak533/AI-Medical-Voice-Vision-Assistant' },
    },
    {
      project: 'predictlab',
      title: 'Prediction flow',
      stages: [
        { label: '30 health inputs' },
        { label: 'Three scikit-learn models', detail: 'SVM for diabetes, Random Forest for stroke, Logistic Regression for heart disease.' },
        { label: 'FastAPI service', detail: 'Serves the pages, the prediction endpoints and the assistant, with no frontend build step.' },
        { label: 'Llama 3.1 on Groq', detail: 'A plain-language explanation and follow-up questions.' },
      ],
      source: { label: 'Repository', href: 'https://github.com/vinayak533/PredictLab-' },
    },
    {
      project: 'nl2sql',
      title: 'Question to SQL',
      stages: [
        { label: 'Plain-English question' },
        { label: 'FastAPI POST /chat', detail: 'A per-minute rate limit and a query cache.' },
        { label: 'Vanna 2.0 agent', detail: 'On Gemini; memory seeded with 20 question-to-SQL pairs.' },
        { label: 'SQLite clinic database', detail: '200 patients, 15 doctors, 500 appointments, 350 treatments, 300 invoices.' },
        { label: 'Structured results', detail: 'Including charts.' },
      ],
      source: { label: 'Repository', href: 'https://github.com/vinayak533/NL2SQL-AI-Assistant' },
    },
    {
      project: 'battle-arena',
      title: 'Judged comparison',
      stages: [
        { label: 'Prompt' },
        { label: 'Two Groq-hosted models', detail: 'Each answers the same prompt.' },
        { label: 'Judge model', detail: 'Rubric: correctness, then completeness, clarity, and safety and best practice.' },
        { label: 'JSON verdict', detail: 'Parsed with documented fallbacks: a malformed judgment is reported, not hidden.' },
        { label: 'CLI', detail: 'Both answers, the verdict and running win counts.' },
      ],
      source: { label: 'Repository', href: 'https://github.com/vinayak533/llm-battle-arena' },
    },
    {
      project: 'stock',
      title: 'Two-agent crew',
      stages: [
        { label: 'Ticker, risk tolerance, horizon' },
        { label: 'Financial Market Analyst agent', detail: 'The only agent with the quote tool: price and daily change through yfinance.' },
        { label: 'Strategic Stock Trader agent', detail: 'Turns the analysis into a recommendation.' },
        { label: 'Buy, Sell or Hold rationale', detail: 'Text only: no orders are placed.' },
      ],
      notes: ['Both agents call Groq through LiteLLM.'],
      source: { label: 'Repository', href: 'https://github.com/vinayak533/AI-Multi-Agent-Stock-Analysis-Trading-System' },
    },
  ] as Architecture[],

  /** Your own questions and answers. They take priority over everything above. */
  faq: [
    // {
    //   ask: ['notice period', 'When can he start?'],
    //   answer: 'Vinayak can join within **30 days**.',
    //   suggestions: ['How can I contact him?'],
    // },
  ] as FaqEntry[],
}
