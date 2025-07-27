declare module "fastify" {
    interface FastifyJWT {
        user: {
            userId: string;
            role?: string;
        };
    }
}
declare const appRouter: import("@trpc/server").TRPCBuiltRouter<{
    ctx: {
        user: {
            userId: string;
            role?: string;
        } | null;
    };
    meta: object;
    errorShape: import("@trpc/server").TRPCDefaultErrorShape;
    transformer: false;
}, import("@trpc/server").TRPCDecorateCreateRouterOptions<{
    getReceipts: import("@trpc/server").TRPCQueryProcedure<{
        input: void;
        output: {
            id: string;
            items: any[];
        }[];
        meta: object;
    }>;
    uploadReceipt: import("@trpc/server").TRPCMutationProcedure<{
        input: {
            imageBase64: string;
        };
        output: {
            success: boolean;
            path: string;
        };
        meta: object;
    }>;
}>>;
export type AppRouter = typeof appRouter;
export {};
