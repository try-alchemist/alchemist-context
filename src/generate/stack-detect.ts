import { readFile, access } from "node:fs/promises";
import { join } from "node:path";

interface StackDetector {
  file: string;
  detect: (content: string) => Record<string, string>;
}

const DETECTORS: StackDetector[] = [
  {
    file: "package.json",
    detect: (content) => {
      const pkg = JSON.parse(content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const stack: Record<string, string> = {};

      // Runtime
      if (deps["next"]) stack.framework = "Next.js";
      else if (deps["nuxt"]) stack.framework = "Nuxt";
      else if (deps["@sveltejs/kit"]) stack.framework = "SvelteKit";
      else if (deps["react"]) stack.framework = "React";
      else if (deps["vue"]) stack.framework = "Vue";
      else if (deps["express"]) stack.framework = "Express";
      else if (deps["hono"]) stack.framework = "Hono";
      else if (deps["fastify"]) stack.framework = "Fastify";

      // Language
      if (deps["typescript"] || deps["@types/node"]) stack.language = "TypeScript";
      else stack.language = "JavaScript";

      // DB
      if (deps["drizzle-orm"]) stack.orm = "Drizzle";
      else if (deps["prisma"] || deps["@prisma/client"]) stack.orm = "Prisma";
      else if (deps["typeorm"]) stack.orm = "TypeORM";
      else if (deps["mongoose"]) stack.database = "MongoDB (Mongoose)";

      // Auth
      if (deps["@supabase/supabase-js"]) stack.auth = "Supabase";
      else if (deps["@clerk/nextjs"] || deps["@clerk/clerk-sdk-node"]) stack.auth = "Clerk";
      else if (deps["next-auth"]) stack.auth = "NextAuth";
      else if (deps["firebase"]) stack.auth = "Firebase";

      // UI
      if (deps["@radix-ui/react-slot"] || deps["class-variance-authority"]) stack.ui = "shadcn/ui";
      else if (deps["@chakra-ui/react"]) stack.ui = "Chakra UI";
      else if (deps["antd"]) stack.ui = "Ant Design";
      else if (deps["@mui/material"]) stack.ui = "Material UI";

      // Testing
      if (deps["vitest"]) stack.testing = "Vitest";
      else if (deps["jest"]) stack.testing = "Jest";

      // Styling
      if (deps["tailwindcss"]) stack.styling = "Tailwind CSS";

      return stack;
    },
  },
  {
    file: "pyproject.toml",
    detect: (content) => {
      const stack: Record<string, string> = { language: "Python" };
      if (content.includes("fastapi")) stack.framework = "FastAPI";
      else if (content.includes("django")) stack.framework = "Django";
      else if (content.includes("flask")) stack.framework = "Flask";
      if (content.includes("pytest")) stack.testing = "pytest";
      if (content.includes("sqlalchemy")) stack.orm = "SQLAlchemy";
      return stack;
    },
  },
  {
    file: "Cargo.toml",
    detect: (content) => {
      const stack: Record<string, string> = { language: "Rust" };
      if (content.includes("actix-web")) stack.framework = "Actix Web";
      else if (content.includes("axum")) stack.framework = "Axum";
      else if (content.includes("rocket")) stack.framework = "Rocket";
      return stack;
    },
  },
  {
    file: "go.mod",
    detect: (content) => {
      const stack: Record<string, string> = { language: "Go" };
      if (content.includes("gin-gonic")) stack.framework = "Gin";
      else if (content.includes("echo")) stack.framework = "Echo";
      else if (content.includes("fiber")) stack.framework = "Fiber";
      return stack;
    },
  },
  {
    file: "Podfile",
    detect: () => ({ language: "Swift", platform: "iOS" }),
  },
  {
    file: "Gemfile",
    detect: (content) => {
      const stack: Record<string, string> = { language: "Ruby" };
      if (content.includes("rails")) stack.framework = "Rails";
      return stack;
    },
  },
];

export async function detectStack(projectRoot: string): Promise<Record<string, string>> {
  const combined: Record<string, string> = {};

  for (const detector of DETECTORS) {
    const filePath = join(projectRoot, detector.file);
    try {
      await access(filePath);
      const content = await readFile(filePath, "utf-8");
      const detected = detector.detect(content);
      Object.assign(combined, detected);
    } catch {
      // File doesn't exist — skip
    }
  }

  return combined;
}
