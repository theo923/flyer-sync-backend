import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import * as ngrok from "ngrok";
import { writeFile, mkdir } from "fs/promises";
import type { FastifyRequest, FastifyReply } from "fastify";
import * as dotenv from "dotenv";
import path from "path";

import { supabase } from "./supabase";
import { appRouter, type AppRouter } from "./routers";

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
console.log("- PORT:", CONFIG.PORT);
console.log("- Supabase:", supabase ? "✅ Connected" : "⚠️ Not configured");

async function createServer() {
  const server = Fastify({
    bodyLimit: CONFIG.BODY_LIMIT,
    logger: false,
  });

  await server.register(fastifyCors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });

  await server.register(fastifyJwt, {
    secret: CONFIG.JWT_SECRET,
  });

  process.on("uncaughtException", (error) => {
    console.error("💥 Uncaught Exception:", error);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("🌋 Unhandled Rejection:", reason);
  });

  server.addHook("preHandler", async (req: FastifyRequest) => {
    console.log(`→ ${req.method} ${req.url} (${req.headers["content-length"] || 0} bytes)`);
  });

  server.setErrorHandler((error, request, reply) => {
    console.error(`❌ Server Error: ${error.message}`);
    console.error(error.stack);
    
    if (error.validation) {
      return reply.status(400).send({ error: "Validation Error", details: error.validation });
    }
    
    if (error.statusCode === 413) {
      return reply.status(413).send({ error: "Payload too large", limit: CONFIG.BODY_LIMIT });
    }

    reply.status(error.statusCode || 500).send({ 
      error: "Internal Server Error", 
      message: error.message 
    });
  });

  return server;
}

function createAuthContext(server: any) {
  return async ({ req }: { req: FastifyRequest }) => {
    let user: { userId: string; role?: string } | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      try {
        const decoded = server.jwt.verify(token);
        // Handle different token formats
        if (typeof decoded === "object") {
          if (decoded.sub) {
            user = { userId: decoded.sub, role: decoded.role };
          } else if (decoded.userId) {
            user = { userId: decoded.userId, role: decoded.role };
          }
        }
      } catch (err: any) {
        // If local verification fails (e.g. invalid algorithm ES256 vs HS256), try Supabase
        if (supabase) {
          try {
            const { data, error } = await supabase.auth.getUser(token);
            if (!error && data.user) {
              user = { userId: data.user.id, role: data.user.role };
            } else {
              console.log("⚠️ Supabase verification failed:", error?.message);
            }
          } catch (sbError) {
             console.error("❌ Supabase auth error:", sbError);
          }
        } else {
           console.log("🔑 JWT verification failed and Supabase not configured:", err.message);
        }
      }
    }

    return { user };
  };
}

async function setupRoutes(server: any) {
  // tRPC handler
  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: createAuthContext(server),
    },
  });

  // Health endpoint
  server.get("/health", async () => ({
    status: "ok",
    supabase: !!supabase,
    timestamp: new Date().toISOString(),
  }));

  // Token generation endpoint (for development/testing)
  server.post("/auth/token", async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId, expiresIn } = request.body as { userId?: string; expiresIn?: string };
    
    if (!userId) {
      return reply.status(400).send({ error: "userId is required" });
    }

    const token = server.jwt.sign(
      { sub: userId, role: "user" },
      { expiresIn: expiresIn || "24h" }
    );

    return { token, userId, expiresIn: expiresIn || "24h" };
  });

  // Static file serving for uploads
  server.get("/uploads/:filename", async (request: FastifyRequest, reply: FastifyReply) => {
    const { filename } = request.params as { filename: string };
    const filepath = path.join(process.cwd(), "uploads", filename);
    
    try {
      const fs = await import("fs/promises");
      const file = await fs.readFile(filepath);
      reply.type("image/jpeg").send(file);
    } catch {
      reply.status(404).send({ error: "File not found" });
    }
  });
}

async function setupNgrokTunnel() {
  if (!CONFIG.NGROK_AUTH_TOKEN) {
    console.log("⚠️ NGROK_AUTH_TOKEN not set, skipping tunnel");
    return null;
  }

  try {
    await ngrok.authtoken(CONFIG.NGROK_AUTH_TOKEN);
    const url = await ngrok.connect({
      addr: CONFIG.PORT,
      hostname: CONFIG.NGROK_DOMAIN,
    });
    console.log(`🌐 Ngrok tunnel: ${url}`);
    return url;
  } catch (error: any) {
    console.error("❌ Ngrok setup failed:", error.message);
    return null;
  }
}

async function start() {
  const server = await createServer();
  await setupRoutes(server);

  await server.listen({ port: CONFIG.PORT, host: "0.0.0.0" });
  console.log(`✅ Server started on port ${CONFIG.PORT}`);

  await setupNgrokTunnel();
}

// Re-export types for client
export type { AppRouter };

start();
