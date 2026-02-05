import { z } from "zod";
import path from "path";
import { writeFile, mkdir } from "fs/promises";
import { router, publicProcedure, protectedProcedure, TRPCError } from "../trpc";
import { supabase, type ReceiptWithDetails } from "../supabase";
import { parseReceiptImage, type ParsedReceipt } from "../gemini";

export const receiptsRouter = router({
  parseWithAI: protectedProcedure
    .input(z.object({ imageBase64: z.string() }))
    .mutation(async ({ input }): Promise<ParsedReceipt> => {
      return await parseReceiptImage(input.imageBase64);
    }),

  bulkSave: protectedProcedure
    .input(z.object({
      storeId: z.string().uuid(),
      storeLocation: z.string().optional(),
      totalPrice: z.number().optional(),
      receiptDate: z.string().optional(),
      receiptTime: z.string().optional(),
      currency: z.string().default('USD'),
      items: z.array(z.object({
        productId: z.string().uuid(),
        price: z.number().positive(),
        quantity: z.number().optional(),
        weight: z.string().optional(),
        unitPrice: z.number().optional(),
        tags: z.array(z.string()).optional(),
      })),
      receiptImagePath: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      
      // Create receipt record first
      const { data: receipt, error: receiptError } = await supabase
        .from("receipts")
        .insert({
          user_id: ctx.user.userId,
          store_id: input.storeId,
          total_price: input.totalPrice || null,
          store_location: input.storeLocation || null,
          receipt_date: input.receiptDate || null,
          receipt_time: input.receiptTime || null,
          currency: input.currency,
          image_path: input.receiptImagePath || null,
        })
        .select()
        .single();
      
      if (receiptError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: receiptError.message });
      
      // Create price records linked to receipt
      const priceRecords = input.items.map((item) => ({
        product_id: item.productId,
        store_id: input.storeId,
        user_id: ctx.user.userId,
        price: item.price,
        quantity: Math.round(item.quantity || 1),
        weight: item.weight || null,
        unit_price: item.unitPrice || null,
        tags: item.tags || null,
        currency: input.currency,
        receipt_id: receipt.id,
        receipt_image_path: input.receiptImagePath || null,
        purchase_time: input.receiptDate ? new Date(`${input.receiptDate}T${input.receiptTime || '12:00'}:00`).toISOString() : new Date().toISOString(),
      }));
      
      const { data, error } = await supabase
        .from("prices")
        .insert(priceRecords)
        .select();
      
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      
      console.log(`✅ Bulk saved ${input.items.length} prices in receipt ${receipt.id}`);
      return { saved: data?.length || 0, receiptId: receipt.id };
    }),

  list: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }).optional())
    .query(async ({ ctx, input }) => {
      if (!supabase) return [];
      
      const { data } = await supabase
        .from("receipts")
        .select("*, stores(*)")
        .eq("user_id", ctx.user.userId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(input?.limit || 20);
      
      return (data || []) as ReceiptWithDetails[];
    }),

  getById: protectedProcedure
    .input(z.object({ receiptId: z.string().uuid() }))
    .query(async ({ input }) => {
      if (!supabase) return null;
      
      const { data: receipt } = await supabase
        .from("receipts")
        .select("*, stores(*)")
        .eq("id", input.receiptId)
        .single();
      
      if (!receipt) return null;
      
      // Get associated prices
      const { data: prices } = await supabase
        .from("prices")
        .select("*, products(*)")
        .eq("receipt_id", input.receiptId)
        .order("detected_at", { ascending: false });
      
      return { ...receipt, prices: prices || [] } as ReceiptWithDetails;
    }),

  softDelete: protectedProcedure
    .input(z.object({ receiptId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      const { error } = await supabase
        .from("receipts")
        .update({ is_deleted: true })
        .eq("id", input.receiptId)
        .eq("user_id", ctx.user.userId);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { success: true };
    }),

  // Legacy upload endpoint
  upload: protectedProcedure
    .input(z.object({ imageBase64: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Save locally as backup
      const uploadsDir = path.join(process.cwd(), "uploads");
      await mkdir(uploadsDir, { recursive: true }).catch(() => {});
      
      const buffer = Buffer.from(input.imageBase64, "base64");
      const filename = `${Date.now()}-${ctx.user.userId}.jpg`;
      const filepath = path.join(uploadsDir, filename);
      await writeFile(filepath, buffer);
      
      // Also upload to Supabase Storage if configured
      let storagePath = filepath;
      if (supabase) {
        const { data, error } = await supabase.storage
          .from("receipts")
          .upload(`${ctx.user.userId}/${filename}`, buffer, {
            contentType: "image/jpeg",
          });
        if (data) storagePath = data.path;
        if (error) console.warn("Storage upload failed:", error.message);
      }
      
      console.log(`✔ Receipt saved: ${storagePath}`);
      return { success: true, path: storagePath };
    }),
});
