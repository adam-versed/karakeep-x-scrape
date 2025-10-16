import { experimental_trpcMiddleware } from "@trpc/server";
import { count, inArray } from "drizzle-orm";
import { z } from "zod";

import { bookmarksInLists } from "@karakeep/db/schema";
import {
  zBookmarkListSchema,
  zEditBookmarkListSchemaWithValidation,
  zMergeListSchema,
  zNewBookmarkListSchema,
} from "@karakeep/shared/types/lists";
import { zCursorV2 } from "@karakeep/shared/types/pagination";

import type { AuthedContext } from "../index";
import { authedProcedure, router } from "../index";
import { List } from "../models/lists";
import { ensureBookmarkOwnership } from "./bookmarks";

export const ensureListOwnership = experimental_trpcMiddleware<{
  ctx: AuthedContext;
  input: { listId: string };
}>().create(async (opts) => {
  const list = await List.fromId(opts.ctx, opts.input.listId);
  return opts.next({
    ctx: {
      ...opts.ctx,
      list,
    },
  });
});

export const listsAppRouter = router({
  create: authedProcedure
    .input(zNewBookmarkListSchema)
    .output(zBookmarkListSchema)
    .mutation(async ({ input, ctx }) => {
      return await List.create(ctx, input).then((l) => l.list);
    }),
  edit: authedProcedure
    .input(zEditBookmarkListSchemaWithValidation)
    .output(zBookmarkListSchema)
    .use(ensureListOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.list.update(input);
      return ctx.list.list;
    }),
  merge: authedProcedure
    .input(zMergeListSchema)
    .mutation(async ({ input, ctx }) => {
      const [sourceList, targetList] = await Promise.all([
        List.fromId(ctx, input.sourceId),
        List.fromId(ctx, input.targetId),
      ]);
      return await sourceList.mergeInto(
        targetList,
        input.deleteSourceAfterMerge,
      );
    }),
  delete: authedProcedure
    .input(
      z.object({
        listId: z.string(),
      }),
    )
    .use(ensureListOwnership)
    .mutation(async ({ ctx }) => {
      await ctx.list.delete();
    }),
  addToList: authedProcedure
    .input(
      z.object({
        listId: z.string(),
        bookmarkId: z.string(),
      }),
    )
    .use(ensureListOwnership)
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.list.addBookmark(input.bookmarkId);
    }),
  removeFromList: authedProcedure
    .input(
      z.object({
        listId: z.string(),
        bookmarkId: z.string(),
      }),
    )
    .use(ensureListOwnership)
    .use(ensureBookmarkOwnership)
    .mutation(async ({ input, ctx }) => {
      await ctx.list.removeBookmark(input.bookmarkId);
    }),
  get: authedProcedure
    .input(
      z.object({
        listId: z.string(),
      }),
    )
    .output(zBookmarkListSchema)
    .use(ensureListOwnership)
    .query(({ ctx }) => {
      return ctx.list.list;
    }),
  list: authedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(20),
          cursor: zCursorV2.optional(),
        })
        .optional(),
    )
    .output(
      z.object({
        lists: z.array(zBookmarkListSchema),
        nextCursor: zCursorV2.nullable(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const results = await List.getAll(ctx, input);
      return {
        lists: results.lists.map((l) => l.list),
        nextCursor: results.nextCursor,
      };
    }),
  getListsOfBookmark: authedProcedure
    .input(z.object({ bookmarkId: z.string() }))
    .output(
      z.object({
        lists: z.array(zBookmarkListSchema),
      }),
    )
    .use(ensureBookmarkOwnership)
    .query(async ({ input, ctx }) => {
      const lists = await List.forBookmark(ctx, input.bookmarkId);
      return { lists: lists.map((l) => l.list) };
    }),
  stats: authedProcedure
    .output(
      z.object({
        stats: z.map(z.string(), z.number()),
      }),
    )
    .query(async ({ ctx }) => {
      // Get all lists without pagination for stats (but limit to reasonable number)
      const results = await List.getAll(ctx, { limit: 100 });
      const lists = results.lists;

      const manualListIds = lists
        .filter((list) => list.type === "manual")
        .map((list) => list.list.id);

      const manualCounts = new Map<string, number>();
      if (manualListIds.length > 0) {
        const aggregated = await ctx.db
          .select({
            listId: bookmarksInLists.listId,
            itemCount: count(bookmarksInLists.bookmarkId),
          })
          .from(bookmarksInLists)
          .where(inArray(bookmarksInLists.listId, manualListIds))
          .groupBy(bookmarksInLists.listId);
        for (const row of aggregated) {
          if (!row.listId) {
            continue;
          }
          manualCounts.set(row.listId, Number(row.itemCount));
        }
      }

      const sizeEntries = await Promise.all(
        lists.map(async (list) => {
          if (list.type === "manual") {
            return [list.list.id, manualCounts.get(list.list.id) ?? 0] as const;
          }
          const size = await list.getSize();
          return [list.list.id, size] as const;
        }),
      );

      return { stats: new Map(sizeEntries) };
    }),

  // Rss endpoints
  regenRssToken: authedProcedure
    .input(
      z.object({
        listId: z.string(),
      }),
    )
    .output(
      z.object({
        token: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const list = await List.fromId(ctx, input.listId);
      const token = await list.regenRssToken();
      return { token: token! };
    }),
  clearRssToken: authedProcedure
    .input(
      z.object({
        listId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const list = await List.fromId(ctx, input.listId);
      await list.clearRssToken();
    }),
  getRssToken: authedProcedure
    .input(
      z.object({
        listId: z.string(),
      }),
    )
    .output(
      z.object({
        token: z.string().nullable(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const list = await List.fromId(ctx, input.listId);
      return { token: await list.getRssToken() };
    }),
});
