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
      status: z.enum(['complete', 'draft']).default('complete'),
      items: z.array(z.object({
        productId: z.string().uuid(),
        price: z.number().positive(),
        quantity: z.number().optional(),
        weight: z.string().optional(),
        unitPrice: z.number().optional(),
        originalPrice: z.number().optional(),
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
          status: input.status,
          image_path: input.receiptImagePath || null,
          items_snapshot: input.status === 'draft' ? input.items : null,
        })
        .select()
        .single();
      
      if (receiptError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: receiptError.message });
      
      // If it's a draft, we're done (don't populate prices table yet)
      if (input.status === 'draft') {
        console.log(`✅ Draft receipt ${receipt.id} saved with ${input.items.length} items in snapshot`);
        return { saved: 0, receiptId: receipt.id };
      }

      // Create price records linked to receipt (Only for completed receipts)
      const purchaseTime = (() => {
        if (!input.receiptDate) return new Date().toISOString();
        try {
          const d = new Date(`${input.receiptDate}T${input.receiptTime || '12:00'}:00`);
          if (!isNaN(d.getTime())) return d.toISOString();
          const d2 = new Date(input.receiptDate);
          if (!isNaN(d2.getTime())) return d2.toISOString();
        } catch (e) {}
        return new Date().toISOString();
      })();

      const priceRecords = input.items.map((item: any) => ({
        product_id: item.productId,
        store_id: input.storeId,
        user_id: ctx.user.userId,
        price: item.price,
        quantity: Math.round(item.quantity || 1),
        weight: item.weight || null,
        unit_price: item.unitPrice || null,
        original_price: item.originalPrice || null,
        tags: item.tags || null,
        currency: input.currency || "USD",
        receipt_id: receipt.id,
        receipt_image_path: input.receiptImagePath || null,
        purchase_time: purchaseTime,
      }));
      
      const { data, error } = await supabase
        .from("prices")
        .insert(priceRecords)
        .select();
      
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      
      console.log(`✅ Bulk saved ${input.items.length} prices in receipt ${receipt.id} (Status: ${input.status})`);
      return { saved: data?.length || 0, receiptId: receipt.id };
    }),

  list: protectedProcedure
    .input(z.object({ 
      limit: z.number().default(20),
      status: z.enum(['complete', 'draft']).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      if (!supabase) return [];
      
      // Default to showing only completed receipts unless specified
      const statusFilter = (input?.status || 'complete') as 'complete' | 'draft';
      
      console.log(`🔍 [Receipts List] Fetching status: ${statusFilter} for user: ${ctx.user.userId}`);
      
      let query = supabase
        .from("receipts")
        .select("*, stores(*)")
        .eq("user_id", ctx.user.userId)
        .eq("is_deleted", false)
        .eq("status", statusFilter);

      if (input?.startDate) {
        query = query.gte("receipt_date", input.startDate);
      }
      if (input?.endDate) {
        query = query.lte("receipt_date", input.endDate);
      }

      const { data } = await query
        .order("receipt_date", { ascending: false })
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
      
      // If it's a draft, items are in items_snapshot
      if (receipt.status === 'draft' && receipt.items_snapshot) {
        const snapshotItems = receipt.items_snapshot as any[];
        
        // Fetch product details for the items in snapshot
        const productIds = snapshotItems.map(i => i.productId);
        const { data: products } = await supabase
          .from("products")
          .select("*")
          .in("id", productIds);
        
        const productsMap = new Map(products?.map(p => [p.id, p]));
        
        // Reconstruct "prices" format for consistent frontend rendering
        const items = snapshotItems.map((item, idx) => ({
          id: `draft-${item.productId}-${idx}`,
          receipt_id: receipt.id,
          product_id: item.productId,
          price: item.price,
          quantity: item.quantity,
          weight: item.weight,
          unit_price: item.unitPrice,
          original_price: item.originalPrice,
          tags: item.tags,
          products: productsMap.get(item.productId) || { name: "Unknown Item" },
        }));

        return { ...receipt, prices: items } as ReceiptWithDetails;
      }

      // If it's complete, get associated prices from prices table
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

  completeDraft: protectedProcedure
    .input(z.object({ receiptId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      if (!supabase) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Database not configured" });
      
      // 1. Get the receipt and its snapshot
      const { data: receipt, error: fetchError } = await supabase
        .from("receipts")
        .select("*")
        .eq("id", input.receiptId)
        .eq("user_id", ctx.user.userId)
        .single();
      
      if (fetchError || !receipt) throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found" });
      if (receipt.status === 'complete') return { success: true }; // Already done
      if (!receipt.items_snapshot) throw new TRPCError({ code: "BAD_REQUEST", message: "No draft data found for this receipt" });

      const items = receipt.items_snapshot as any[];
      
      const purchaseTime = (() => {
        if (!receipt.receipt_date) return receipt.created_at;
        try {
          const d = new Date(`${receipt.receipt_date}T${receipt.receipt_time || '12:00'}:00`);
          if (!isNaN(d.getTime())) return d.toISOString();
          const d2 = new Date(receipt.receipt_date);
          if (!isNaN(d2.getTime())) return d2.toISOString();
        } catch (e) {}
        return receipt.created_at;
      })();

      // 2. Insert into prices table
      const priceRecords = items.map((item: any) => ({
        product_id: item.productId,
        store_id: receipt.store_id,
        user_id: ctx.user.userId,
        price: item.price,
        quantity: Math.round(item.quantity || 1),
        weight: item.weight || null,
        unit_price: item.unitPrice || null,
        original_price: item.originalPrice || null,
        tags: item.tags || null,
        currency: receipt.currency,
        receipt_id: receipt.id,
        receipt_image_path: receipt.image_path || null,
        purchase_time: purchaseTime,
      }));

      const { error: priceError } = await supabase
        .from("prices")
        .insert(priceRecords);
      
      if (priceError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: priceError.message });

      // 3. Mark as complete and clear snapshot
      const { error: updateError } = await supabase
        .from("receipts")
        .update({ status: 'complete', items_snapshot: null })
        .eq("id", input.receiptId);

      if (updateError) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: updateError.message });
      
      console.log(`✅ Draft receipt ${input.receiptId} finalized and ${items.length} prices inserted.`);
      return { success: true };
    }),

  checkDuplicate: protectedProcedure
    .input(z.object({
      storeId: z.string().uuid(),
      receiptDate: z.string(),
      receiptTime: z.string().optional().nullable(),
    }))
    .query(async ({ input, ctx }) => {
      if (!supabase) return { exists: false };
      
      const baseQuery = supabase
        .from("receipts")
        .select("id, receipt_time")
        .eq("user_id", ctx.user.userId)
        .eq("store_id", input.storeId)
        .eq("receipt_date", input.receiptDate);

      const { data: dayReceipts } = await baseQuery;
      
      if (!dayReceipts || dayReceipts.length === 0) {
        return { exists: false, potential: false };
      }

      // If no time provided, it's at least a potential (day) duplicate
      if (!input.receiptTime) {
        return { exists: false, potential: true };
      }

      // Check for exact time match (within minute range)
      const exactMatch = dayReceipts.some(r => {
          if (!r.receipt_time) return false;
          const rTime = r.receipt_time.substring(0, 5); // HH:mm
          return rTime === input.receiptTime!.substring(0, 5);
      });

      return { 
        exists: exactMatch, 
        potential: !exactMatch // It exists on this day, but not at this exact time
      };
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
