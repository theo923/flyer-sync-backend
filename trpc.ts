import { initTRPC, TRPCError } from "@trpc/server";

// Context type for tRPC
export type TRPCContext = {
  user: { userId: string; role?: string } | null;
};

// Initialize tRPC with context
const t = initTRPC.context<TRPCContext>().create();

// Base router and procedures
export const router = t.router;
export const publicProcedure = t.procedure;

// Protected procedure with auth middleware
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Re-export TRPCError for convenience
export { TRPCError };
