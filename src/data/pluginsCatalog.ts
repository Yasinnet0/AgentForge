import { CatalogPlugin } from '../types/catalog';

export const PLUGINS_CATALOG: CatalogPlugin[] = [
  {
    "id": "game-engine-studio",
    "name": "Game Engine Pro Studio",
    "version": "2.0.0",
    "description": "Elite game development powerhouse bundling Unreal Engine 5, Unity, Godot 4, and Blender 3D alongside gameplay architecture skills.",
    "category": "Game Development",
    "author": "Community",
    "bundledSkills": [
      "unreal-engine-blueprints",
      "unity-engine-csharp",
      "godot-gdscript-patterns",
      "blender-python-automation",
      "shader-graph-and-glsl",
      "procedural-world-generation"
    ],
    "bundledMcps": [
      "unreal-engine",
      "unity-engine",
      "godot-engine",
      "blender",
      "blender-ai-enhanced"
    ],
    "tags": [
      "game-dev",
      "unreal",
      "unity",
      "godot",
      "blender",
      "3d",
      "shaders"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "creative-3d-vfx-suite",
    "name": "Creative 3D & VFX Suite",
    "version": "1.5.0",
    "description": "Complete multimedia and visual art studio connecting Blender, DaVinci Resolve, Photopea, Aseprite, and FreeCAD for 3D modeling and video editing.",
    "category": "Creative & Media",
    "author": "Community",
    "bundledSkills": [
      "blender-python-automation",
      "shader-graph-and-glsl",
      "threejs-pbr-pipeline",
      "canvas-design"
    ],
    "bundledMcps": [
      "blender",
      "davinci-resolve",
      "photopea",
      "aseprite",
      "freecad"
    ],
    "tags": [
      "3d",
      "blender",
      "davinci",
      "video",
      "photopea",
      "vfx",
      "art"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "minecraft-autonomous-lab",
    "name": "Minecraft Autonomous World Studio",
    "version": "1.2.0",
    "description": "Autonomous Minecraft bot and world automation platform: survival navigation, procedural construction, crafting recipes, and RCON administration.",
    "category": "Game Development",
    "author": "Community",
    "bundledSkills": [
      "minecraft-bot-automation",
      "procedural-world-generation",
      "game-ai-behavior-trees"
    ],
    "bundledMcps": [
      "minecraft",
      "minecraft-survival"
    ],
    "tags": [
      "minecraft",
      "game-ai",
      "bot",
      "world-gen",
      "survival"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "audio-sonic-engineering",
    "name": "Audio & Sonic Engineering Lab",
    "version": "1.1.0",
    "description": "Interactive audio processing, DSP sound synthesis, Spotify music metadata queries, and streaming broadcast automation with OBS Studio.",
    "category": "Audio & Broadcast",
    "author": "Community",
    "bundledSkills": [
      "game-audio-dsp",
      "websocket-realtime-protocol"
    ],
    "bundledMcps": [
      "spotify",
      "obs-studio",
      "desktop-commander"
    ],
    "tags": [
      "audio",
      "dsp",
      "spotify",
      "obs",
      "streaming",
      "sound"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "cloud-kubernetes-architect",
    "name": "Cloud Native & Kubernetes Architect",
    "version": "2.1.0",
    "description": "Enterprise cloud infrastructure toolkit uniting Kubernetes, Docker, AWS, Cloudflare, and Terraform for automated infrastructure as code.",
    "category": "DevOps & Cloud",
    "author": "Community",
    "bundledSkills": [
      "kubernetes-cloud-native",
      "docker-container-mastery",
      "terraform-iac-patterns",
      "aws-serverless-architecture",
      "cloudflare-workers-edge"
    ],
    "bundledMcps": [
      "kubernetes",
      "docker",
      "aws",
      "cloudflare",
      "terraform"
    ],
    "tags": [
      "kubernetes",
      "docker",
      "aws",
      "terraform",
      "cloudflare",
      "cloud",
      "devops"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "vector-data-intelligence",
    "name": "Vector DB & Semantic Search Engine",
    "version": "2.0.0",
    "description": "State-of-the-art vector intelligence and embedding retrieval combining Qdrant, Chroma, Weaviate, Milvus, and Elasticsearch.",
    "category": "AI & Data",
    "author": "Community",
    "bundledSkills": [
      "vector-search-embeddings",
      "llamaindex-rag-pipeline",
      "agent-memory-systems"
    ],
    "bundledMcps": [
      "qdrant",
      "chroma",
      "weaviate",
      "milvus",
      "elasticsearch"
    ],
    "tags": [
      "vector",
      "rag",
      "embeddings",
      "qdrant",
      "chroma",
      "weaviate",
      "search"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "deep-research-intelligence",
    "name": "Deep Research & Scholarly Suite",
    "version": "2.0.0",
    "description": "Autonomous research lab combining scientific paper retrieval from ArXiv, intelligent web crawlers (Firecrawl, Exa, Tavily), and Obsidian PKM note taking.",
    "category": "Research & Intelligence",
    "author": "Community",
    "bundledSkills": [
      "enhance-prompt",
      "agent-memory-systems",
      "spec-driven-development"
    ],
    "bundledMcps": [
      "arxiv",
      "brave-search",
      "tavily",
      "exa",
      "firecrawl",
      "obsidian"
    ],
    "tags": [
      "research",
      "arxiv",
      "tavily",
      "firecrawl",
      "obsidian",
      "knowledge"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "sql-database-titan",
    "name": "SQL & Relational Database Titan",
    "version": "2.0.0",
    "description": "High-performance SQL engineering pack: deep PostgreSQL query planning, MySQL clustering, SQLite local persistence, and cloud databases (Supabase, Neon).",
    "category": "Database",
    "author": "Community",
    "tags": [
      "postgres",
      "mysql",
      "sqlite",
      "supabase",
      "neon",
      "sql",
      "database"
    ],
    "bundledSkills": [
      "postgres-performance-tuning",
      "sqlite-wal-embedded-engine",
      "database-architect",
      "supabase-row-level-security"
    ],
    "bundledMcps": [
      "postgres",
      "mysql",
      "sqlite",
      "supabase",
      "neon"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "nosql-realtime-cache",
    "name": "NoSQL & Realtime Cache Suite",
    "version": "1.4.0",
    "description": "Sub-millisecond data systems combining Redis distributed caching, MongoDB document aggregation, ClickHouse analytics, and serverless Upstash.",
    "category": "Database",
    "author": "Community",
    "bundledSkills": [
      "redis-caching-architect",
      "clickhouse-olap-analytics",
      "mongodb-aggregation-mastery",
      "distributed-locking-redis"
    ],
    "bundledMcps": [
      "redis",
      "mongodb",
      "clickhouse",
      "upstash"
    ],
    "tags": [
      "redis",
      "mongodb",
      "clickhouse",
      "upstash",
      "caching",
      "nosql"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "social-community-automation",
    "name": "Social Media & Community Automation",
    "version": "1.3.0",
    "description": "Multi-platform community engagement automation: Discord server bots, Telegram channels, Slack workspace integrations, and Resend transactional emails.",
    "category": "Communication",
    "author": "Community",
    "bundledSkills": [
      "websocket-realtime-protocol",
      "api-design-principles",
      "agent-tool-builder"
    ],
    "bundledMcps": [
      "discord",
      "telegram",
      "slack",
      "resend",
      "steam"
    ],
    "tags": [
      "discord",
      "telegram",
      "slack",
      "resend",
      "steam",
      "community",
      "bots"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "desktop-native-commander",
    "name": "Desktop Commander & Local OS Control",
    "version": "2.0.0",
    "description": "Direct operating system terminal control, cross-platform file management, background process execution, and system performance monitoring.",
    "category": "System & OS",
    "author": "wonderwhy-er",
    "bundledSkills": [
      "electron-development",
      "systematic-debugging",
      "v8-memory-leak-profiling"
    ],
    "bundledMcps": [
      "desktop-commander",
      "filesystem",
      "everything",
      "system-monitor"
    ],
    "tags": [
      "desktop",
      "os",
      "terminal",
      "filesystem",
      "system",
      "commander"
    ],
    "sourceRegistry": "Awesome MCP",
    "license": "MIT"
  },
  {
    "id": "fintech-crypto-intelligence",
    "name": "FinTech & Web3 Blockchain Suite",
    "version": "1.2.0",
    "description": "Real-time financial markets, on-chain ledger queries (Etherscan, Solscan), crypto price indices (CoinGecko), and Stripe checkout monetization.",
    "category": "Finance & Crypto",
    "author": "Community",
    "bundledSkills": [
      "api-design-principles",
      "jwt-security-and-token-rotation",
      "clean-code-guard"
    ],
    "bundledMcps": [
      "stripe",
      "coingecko",
      "etherscan",
      "solscan",
      "alpha-vantage"
    ],
    "tags": [
      "fintech",
      "crypto",
      "stripe",
      "etherscan",
      "coingecko",
      "web3",
      "finance"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "productivity-second-brain",
    "name": "Productivity & Second Brain Workspace",
    "version": "1.8.0",
    "description": "Unified digital workspace integrating Notion databases, Obsidian markdown vaults, Linear issue tracking, Jira enterprise tickets, and Google Calendar.",
    "category": "Productivity",
    "author": "Community",
    "bundledSkills": [
      "spec-driven-development",
      "plan-driven-development",
      "agent-memory-systems"
    ],
    "bundledMcps": [
      "notion",
      "obsidian",
      "linear",
      "jira",
      "google-calendar",
      "todoist"
    ],
    "tags": [
      "productivity",
      "notion",
      "obsidian",
      "linear",
      "jira",
      "second-brain"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "api-microservices-architect",
    "name": "API Microservices & Event Streamer",
    "version": "2.0.0",
    "description": "Distributed microservices architecture kit: Apollo GraphQL Federation, gRPC Protocol Buffers v3, Apache Kafka streaming, and OpenAPI generator.",
    "category": "Backend & API",
    "author": "Community",
    "bundledSkills": [
      "graphql-federation-apollo",
      "grpc-protocol-buffers-v3",
      "kafka-event-streaming-pro",
      "api-documentation-generator",
      "fastapi-async-architecture"
    ],
    "bundledMcps": [
      "postman",
      "openapi",
      "graphql",
      "kafka",
      "kong"
    ],
    "tags": [
      "api",
      "microservices",
      "graphql",
      "grpc",
      "kafka",
      "openapi"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "security-red-team-arsenal",
    "name": "Security Red Team & Defense Arsenal",
    "version": "2.2.0",
    "description": "Comprehensive cybersecurity operations: OWASP API vulnerability scanning, penetration testing probes, GitGuardian secret leakage detection, and Shodan recon.",
    "category": "Security",
    "author": "Community",
    "bundledSkills": [
      "api-security-best-practices",
      "api-security-testing",
      "reverse-engineering-binary",
      "zero-trust-architecture-mtls",
      "cloud-iam-least-privilege"
    ],
    "bundledMcps": [
      "shodan",
      "virustotal",
      "gitguardian",
      "snyk",
      "filesystem"
    ],
    "tags": [
      "security",
      "redteam",
      "pentest",
      "owasp",
      "shodan",
      "vulnerability"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "clean-code-refactoring-sentinel",
    "name": "Clean Code & Refactoring Sentinel",
    "version": "2.0.0",
    "description": "Software craftsmanship and quality gate: five-axis peer review, dead code simplification, SonarQube quality analysis, and zero-downtime refactoring.",
    "category": "Quality & Review",
    "author": "Community",
    "bundledSkills": [
      "clean-code-guard",
      "code-review-and-quality",
      "code-simplification",
      "refactoring-legacy-code",
      "architectural-constraints"
    ],
    "bundledMcps": [
      "sonarqube",
      "github",
      "gitlab",
      "filesystem"
    ],
    "tags": [
      "clean-code",
      "refactoring",
      "code-review",
      "quality",
      "sonar"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "python-data-science-lab",
    "name": "Python Data Science & ML Lab",
    "version": "1.5.0",
    "description": "Data science and machine learning research lab: PyTorch deep learning pipelines, Jupyter Notebook automation, DuckDB analytics, and MLflow tracking.",
    "category": "Data Science & ML",
    "author": "Community",
    "bundledSkills": [
      "async-python-patterns",
      "peft-lora-fine-tuning",
      "duckdb-in-process-analytics"
    ],
    "bundledMcps": [
      "jupyter",
      "python-eval",
      "mlflow",
      "filesystem"
    ],
    "tags": [
      "python",
      "ml",
      "pytorch",
      "jupyter",
      "data-science",
      "analytics"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "rust-systems-performance",
    "name": "Rust Systems & High Performance",
    "version": "1.3.0",
    "description": "Blazing fast memory-safe systems engineering with Rust, Tokio asynchronous runtime, zero-cost abstractions, and high-concurrency network servers.",
    "category": "Systems Programming",
    "author": "Community",
    "bundledSkills": [
      "rust-tokio-async-systems",
      "grpc-protocol-buffers-v3",
      "v8-memory-leak-profiling"
    ],
    "bundledMcps": [
      "crates",
      "cargo",
      "filesystem",
      "desktop-commander"
    ],
    "tags": [
      "rust",
      "systems",
      "tokio",
      "performance",
      "concurrency"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "modern-frontend-ui-max",
    "name": "Modern Frontend UI/UX Studio Pro",
    "version": "2.5.0",
    "description": "State-of-the-art web interface craftsmanship: Tailwind CSS v4 design tokens, React UI patterns, Three.js 3D web scenes, and Antigravity Swiss typography.",
    "category": "Frontend & UI",
    "author": "Community",
    "bundledSkills": [
      "tailwind-v4-expert",
      "code-showcase-react-ui-patterns",
      "3d-web-experience",
      "antigravity-design-expert",
      "web-accessibility-wcag",
      "web-performance-audit"
    ],
    "bundledMcps": [
      "figma",
      "puppeteer",
      "browserbase"
    ],
    "tags": [
      "frontend",
      "react",
      "tailwind",
      "threejs",
      "ui",
      "design",
      "ux"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "mobile-cross-platform-suite",
    "name": "Mobile & Cross-Platform Suite",
    "version": "1.4.0",
    "description": "Universal application development across iOS, Android, and Desktop with React Native Expo Router, Flutter BLoC, and Tauri 2.0 Rust.",
    "category": "Mobile & Desktop",
    "author": "Community",
    "bundledSkills": [
      "react-native-expo-router",
      "flutter-clean-architecture",
      "tauri-desktop-architecture",
      "electron-development"
    ],
    "bundledMcps": [
      "appcenter",
      "firebase",
      "filesystem",
      "desktop-commander"
    ],
    "tags": [
      "mobile",
      "react-native",
      "expo",
      "flutter",
      "tauri",
      "ios",
      "android"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "observability-telemetry-suite",
    "name": "Observability & Telemetry Sentinel",
    "version": "1.6.0",
    "description": "Full-stack production telemetry: real-time Sentry crash diagnostics, Datadog APM tracing, Prometheus metric scrapers, and OpenTelemetry pipelines.",
    "category": "DevOps & Reliability",
    "author": "Community",
    "bundledSkills": [
      "prometheus-grafana-observability",
      "opentelemetry-distributed-tracing",
      "systematic-debugging"
    ],
    "bundledMcps": [
      "sentry",
      "datadog",
      "prometheus",
      "grafana"
    ],
    "tags": [
      "observability",
      "sentry",
      "datadog",
      "prometheus",
      "grafana",
      "telemetry"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "web-scraping-browser-automation",
    "name": "Browser Automation & Headless Lab",
    "version": "2.0.0",
    "description": "Reliable headless browser testing and web extraction uniting Playwright, Puppeteer, Firecrawl smart markdown extraction, and Browserbase cloud browsers.",
    "category": "Automation & Testing",
    "author": "Community",
    "bundledSkills": [
      "playwright-e2e-automation",
      "browser-dom-perf-tuning",
      "test-driven-development"
    ],
    "bundledMcps": [
      "playwright",
      "puppeteer",
      "firecrawl",
      "browserbase"
    ],
    "tags": [
      "playwright",
      "puppeteer",
      "scraping",
      "automation",
      "testing",
      "firecrawl"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "llm-rag-agentic-framework",
    "name": "Agentic RAG & Evaluation Framework",
    "version": "2.0.0",
    "description": "Comprehensive LLM intelligence stack: LangGraph multi-agent coordination, LlamaIndex hierarchical chunking, benchmark evaluators, and prompt defense.",
    "category": "AI & Multi-Agent",
    "author": "Community",
    "bundledSkills": [
      "langchain-agentic-flows",
      "llamaindex-rag-pipeline",
      "llm-evaluator-benchmarks",
      "function-calling-tool-guards",
      "prompt-injection-defense"
    ],
    "bundledMcps": [
      "qdrant",
      "brave-search",
      "obsidian",
      "filesystem"
    ],
    "tags": [
      "langchain",
      "llamaindex",
      "rag",
      "agents",
      "evals",
      "ai"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "spec-and-plan-driven-sdlc",
    "name": "Spec & Plan-Driven SDLC Suite",
    "version": "2.0.0",
    "description": "Engineering excellence playbooks inspired by Addy Osmani: Spec-driven development, atomic task breakdown, incremental shipping, and pre-release gates.",
    "category": "Engineering Playbooks",
    "author": "Community",
    "bundledSkills": [
      "spec-driven-development",
      "plan-driven-development",
      "incremental-delivery",
      "production-shipping",
      "interview-me"
    ],
    "bundledMcps": [
      "github",
      "linear",
      "notion",
      "filesystem"
    ],
    "tags": [
      "spec",
      "plan",
      "sdlc",
      "agile",
      "delivery",
      "playbooks"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "fullstack-engineer-kit",
    "name": "Fullstack Pro Studio",
    "version": "2.0.0",
    "description": "Comprehensive kit bundling frontend React & 3D Web patterns, REST/GraphQL API design principles, and database architecture.",
    "category": "Engineering Suite",
    "author": "Community",
    "bundledSkills": [
      "3d-web-experience",
      "code-showcase-react-ui-patterns",
      "api-design-principles",
      "database-architect",
      "postgres-performance-tuning"
    ],
    "bundledMcps": [
      "postgres",
      "filesystem",
      "github"
    ],
    "tags": [
      "fullstack",
      "react",
      "api",
      "database",
      "engineering"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "devops-commander-kit",
    "name": "DevOps & Git Commander",
    "version": "2.0.0",
    "description": "Autonomous Git workflows, rebase automation, PR reviewer, automated git hooks, and terminal command execution capabilities.",
    "category": "DevOps Toolkit",
    "author": "Community",
    "bundledSkills": [
      "git-advanced-workflows",
      "git-pr-review",
      "git-hooks-automation",
      "github-actions-ci-cd"
    ],
    "bundledMcps": [
      "desktop-commander",
      "docker",
      "github"
    ],
    "tags": [
      "devops",
      "git",
      "terminal",
      "docker",
      "pr"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "qa-sentinel-suite",
    "name": "QA & Precision Debug Suite",
    "version": "2.0.0",
    "description": "Elite quality engineering suite bundling Test-Driven Development (TDD), systematic debugging, and A/B test experiments.",
    "category": "Quality Suite",
    "author": "Community",
    "bundledSkills": [
      "test-driven-development",
      "systematic-debugging",
      "ab-testing",
      "clean-code-guard",
      "playwright-e2e-automation"
    ],
    "bundledMcps": [
      "puppeteer",
      "sentry",
      "playwright"
    ],
    "tags": [
      "tdd",
      "testing",
      "debug",
      "qa",
      "reliability"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "ai-orchestration-pack",
    "name": "Multi-Agent Intelligence Pack",
    "version": "2.0.0",
    "description": "Autonomous agent squad orchestration, vector-augmented memory systems, prompt engineering, and custom tool binding.",
    "category": "AI Multi-Agent Pack",
    "author": "Community",
    "bundledSkills": [
      "agent-orchestrator",
      "agent-memory-systems",
      "agent-tool-builder",
      "enhance-prompt",
      "langchain-agentic-flows"
    ],
    "bundledMcps": [
      "brave-search",
      "obsidian",
      "qdrant"
    ],
    "tags": [
      "agents",
      "multi-agent",
      "memory",
      "prompting",
      "orchestration"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "security-fortress-kit",
    "name": "Security Fortress Kit",
    "version": "2.0.0",
    "description": "Defensive engineering kit with OWASP API top 10 security defenses, automated penetration testing, and clean code boundaries.",
    "category": "Security Bundle",
    "author": "Community",
    "bundledSkills": [
      "api-security-best-practices",
      "api-security-testing",
      "clean-code-guard",
      "zero-trust-architecture-mtls"
    ],
    "bundledMcps": [
      "github",
      "filesystem",
      "snyk"
    ],
    "tags": [
      "security",
      "owasp",
      "pentest",
      "audit",
      "defense"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "reverse-engineering-suite",
    "name": "Reverse Engineering & Binary Analysis Suite",
    "version": "1.0.0",
    "description": "Comprehensive reverse engineering powerhouse bundling REA (Reverse Engineer Anything), Ghidra disassembly, Electron ASAR unpacking, API network interception, and binary vulnerability discovery.",
    "category": "Security & Forensics",
    "author": "Community",
    "bundledSkills": [
      "reverse-engineer-anything",
      "reverse-engineering-binary",
      "electron-app-forensics",
      "api-network-reverse-engineering",
      "v8-memory-leak-profiling"
    ],
    "bundledMcps": [
      "rea",
      "filesystem",
      "git"
    ],
    "tags": [
      "rea",
      "reverse-engineering",
      "binary",
      "decompilation",
      "ghidra",
      "forensics",
      "security",
      "asar"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "modern-dev-stack-kit",
    "name": "Modern Dev Stack & Anti-Hallucination Kit",
    "version": "1.0.0",
    "description": "Eliminate outdated API hallucinations and streamline production development with live Context7 documentation injection, Supabase database tooling, and Linear issue tracking.",
    "category": "Productivity & Docs",
    "author": "Community",
    "bundledSkills": [
      "context-engine-anti-hallucination",
      "api-design-principles",
      "clean-code-guard",
      "fullstack-agentic-orchestration"
    ],
    "bundledMcps": [
      "context7",
      "supabase",
      "linear",
      "github"
    ],
    "tags": [
      "context7",
      "supabase",
      "linear",
      "documentation",
      "anti-hallucination",
      "developer-tools"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "enterprise-observability-qa-suite",
    "name": "Enterprise Observability & QA Suite",
    "version": "1.0.0",
    "description": "Production-grade quality assurance and observability kit combining Sentry error monitoring, Playwright browser automation, OpenTelemetry tracing, and Docker container management.",
    "category": "Testing & Observability",
    "author": "Community",
    "bundledSkills": [
      "playwright-e2e-automation",
      "opentelemetry-distributed-tracing",
      "v8-memory-leak-profiling",
      "clean-code-guard"
    ],
    "bundledMcps": [
      "sentry",
      "playwright",
      "docker"
    ],
    "tags": [
      "sentry",
      "playwright",
      "docker",
      "observability",
      "qa",
      "testing",
      "monitoring"
    ],
    "sourceRegistry": "Community",
    "license": "MIT"
  },
  {
    "id": "understand-anything",
    "name": "Understand Anything",
    "version": "2.9.2",
    "description": "AI-powered codebase understanding — multi-agent pipeline, interactive knowledge graph, entity extraction, architectural layer maps, and onboarding dashboards.",
    "category": "Codebase Intelligence",
    "author": "Egonex",
    "bundledSkills": [
      "understand",
      "understand-chat",
      "understand-dashboard",
      "understand-diff",
      "understand-domain",
      "understand-explain",
      "understand-figma",
      "understand-knowledge",
      "understand-onboard"
    ],
    "bundledMcps": [],
    "tags": [
      "codebase-analysis",
      "knowledge-graph",
      "architecture",
      "onboarding",
      "dashboard"
    ],
    "sourceRegistry": "Anthropic Community",
    "license": "MIT"
  }
];

