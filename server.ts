import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import { initTRPC } from "@trpc/server";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import * as ngrok from "ngrok";
import { writeFile, mkdir } from "fs/promises";
import { z } from "zod";
import type { FastifyRequest, FastifyReply } from "fastify";
import * as dotenv from "dotenv";
import path from "path";

// Explicitly load environment variables
dotenv.config();

declare module "@fastify/jwt" {
  interface FastifyJWT {
    user: { userId: string; role?: string };
  }
}

// Validate required environment variables
if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET environment variable is required!");
  process.exit(1);
}

const CONFIG = {
  PORT: Number(process.env.PORT || 4000),
  JWT_SECRET: process.env.JWT_SECRET as string,
  NGROK_AUTH_TOKEN: process.env.NGROK_AUTH_TOKEN,
  NGROK_DOMAIN: process.env.NGROK_DOMAIN,
  BODY_LIMIT: 50 * 1024 * 1024, // 50MB
};

console.log("🔧 Server configuration:");
console.log("- JWT_SECRET:", CONFIG.JWT_SECRET);
console.log("- NGROK_DOMAIN:", CONFIG.NGROK_DOMAIN);
console.log("- PORT:", CONFIG.PORT);

async function createServer() {
  const server = Fastify({
    bodyLimit: CONFIG.BODY_LIMIT,
    logger: false, // Disable default logging for cleaner output
  });

  // CORS configuration
  await server.register(fastifyCors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });

  // JWT configuration
  await server.register(fastifyJwt, {
    secret: CONFIG.JWT_SECRET,
  });

  // Request logging middleware
  server.addHook("preHandler", async (req: FastifyRequest) => {
    console.log(`→ ${req.method} ${req.url}`);
    console.log(`→ ${req.method} ${req.url}`);
  });

  return server;
}
function createTRPCRouter(server: any) {
  const t = initTRPC
    .context<{ user: { userId: string; role?: string } | null }>()
    .create();

  return t.router({
    getReceipts: t.procedure.query(({ ctx }) => {
      if (!ctx.user) throw new Error("UNAUTHORIZED");
      return [] as Array<{ id: string; items: any[] }>;
    }),

    uploadReceipt: t.procedure
      .input(z.object({ imageBase64: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.user) throw new Error("UNAUTHORIZED");

        // Ensure uploads directory exists
        const uploadsDir = path.join(process.cwd(), "uploads");
        try {
          await mkdir(uploadsDir, { recursive: true });
        } catch (error) {
          // Directory might already exist, that's okay
        }

        const buffer = Buffer.from(input.imageBase64, "base64");
        const filename = path.join(
          uploadsDir,
          `${Date.now()}-${ctx.user.userId}.jpg`
        );

        await writeFile(filename, buffer);
        console.log(`✔ Receipt saved: ${filename}`);

        return { success: true, path: filename };
      }),
  });
}

function createAuthContext(server: any) {
  return ({ req }: { req: FastifyRequest }) => {
    let user: { userId: string; role?: string } | null = null;

    try {
      const auth = (req.headers.authorization as string) ?? "";
      console.log(
        "🔑 Auth header:",
        auth ? `Bearer ${auth.slice(7, 20)}...` : "missing"
      );

      if (auth.startsWith("Bearer ")) {
        const token = auth.slice(7);
        user = server.jwt.verify(token) as {
          userId: string;
          role?: string;
        };
        console.log("✅ Token verified, user:", user.userId);
      } else {
        console.log("❌ No Bearer token found");
      }
    } catch (error) {
      console.log(
        "❌ JWT verification failed:",
        error instanceof Error ? error.message : String(error)
      );
    }

    console.log("👤 Context user:", user ? user.userId : "null");
    return { user };
  };
}

async function setupRoutes(server: any) {
  const appRouter = createTRPCRouter(server);

  // tRPC routes
  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: createAuthContext(server),
    },
  });

  // Authentication route
  server.post("/login", async (req: FastifyRequest, reply: FastifyReply) => {
    const { username, password } = req.body as {
      username: string;
      password: string;
    };

    // TODO: Implement proper authentication
    const userId = "user-123";
    const token = await reply.jwtSign({ userId, role: "user" });

    return reply.send({ token });
  });
}

async function setupNgrokTunnel() {
  if (!CONFIG.NGROK_AUTH_TOKEN) {
    console.log("⚠️  NGROK_AUTH_TOKEN not found - skipping tunnel");
    return;
  }

  try {
    console.log("🔗 Starting ngrok tunnel...");

    const url = await ngrok.connect({
      port: CONFIG.PORT,
      authtoken: CONFIG.NGROK_AUTH_TOKEN,
      hostname: CONFIG.NGROK_DOMAIN,
    });

    console.log(`🔗 Public API: ${url}/trpc`);
  } catch (error) {
    console.warn(
      "⚠️  Failed to start ngrok tunnel:",
      error instanceof Error ? error.message : String(error)
    );
    console.log(
      `💡 Manual command: ngrok http --url=${CONFIG.NGROK_DOMAIN} ${CONFIG.PORT}`
    );
  }
}

async function start() {
  try {
    const server = await createServer();
    await setupRoutes(server);

    await server.listen({ port: CONFIG.PORT, host: "0.0.0.0" });
    console.log(`� Server running on http://0.0.0.0:${CONFIG.PORT}`);

    await setupNgrokTunnel();
    console.log("✅ Server ready");
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

start();
