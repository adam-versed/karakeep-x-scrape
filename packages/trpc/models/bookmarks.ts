import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  inArray,
  lt,
  lte,
  or,
} from "drizzle-orm";
import invariant from "tiny-invariant";
import { z } from "zod";

import {
  assets,
  AssetTypes,
  bookmarkAssets,
  bookmarkLinks,
  bookmarks,
  bookmarksInLists,
  bookmarkTexts,
  rssFeedImportsTable,
  tagsOnBookmarks,
} from "@karakeep/db/schema";
import serverConfig from "@karakeep/shared/config";
import {
  createSignedToken,
  getAlignedExpiry,
} from "@karakeep/shared/signedTokens";
import { zAssetSignedTokenSchema } from "@karakeep/shared/types/assets";
import {
  BookmarkTypes,
  DEFAULT_NUM_BOOKMARKS_PER_PAGE,
  ZBookmark,
  ZBookmarkContent,
  zGetBookmarksRequestSchema,
  ZPublicBookmark,
} from "@karakeep/shared/types/bookmarks";
import { ZCursor } from "@karakeep/shared/types/pagination";
import {
  getBookmarkLinkAssetIdOrUrl,
  getBookmarkTitle,
} from "@karakeep/shared/utils/bookmarkUtils";

import { AuthedContext } from "..";
import { mapDBAssetTypeToUserType } from "../lib/attachments";
import { List } from "./lists";
import { PrivacyAware } from "./privacy";

export class Bookmark implements PrivacyAware {
  protected constructor(
    protected ctx: AuthedContext,
    public bookmark: ZBookmark & { userId: string },
  ) {}

  ensureCanAccess(ctx: AuthedContext): void {
    if (this.bookmark.userId != ctx.user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "User is not allowed to access resource",
      });
    }
  }

  static fromData(ctx: AuthedContext, data: ZBookmark) {
    return new Bookmark(ctx, {
      ...data,
      userId: ctx.user.id,
    });
  }

  static async loadMulti(
    ctx: AuthedContext,
    input: z.infer<typeof zGetBookmarksRequestSchema>,
  ): Promise<{
    bookmarks: Bookmark[];
    nextCursor: ZCursor | null;
  }> {
    if (input.ids && input.ids.length == 0) {
      return { bookmarks: [], nextCursor: null };
    }
    if (!input.limit) {
      input.limit = DEFAULT_NUM_BOOKMARKS_PER_PAGE;
    }
    if (input.listId) {
      const list = await List.fromId(ctx, input.listId);
      if (list.type === "smart") {
        input.ids = await list.getBookmarkIds();
        delete input.listId;
      }
    }

    const sq = ctx.db.$with("bookmarksSq").as(
      ctx.db
        .select()
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, ctx.user.id),
            input.archived !== undefined
              ? eq(bookmarks.archived, input.archived)
              : undefined,
            input.favourited !== undefined
              ? eq(bookmarks.favourited, input.favourited)
              : undefined,
            input.ids ? inArray(bookmarks.id, input.ids) : undefined,
            input.tagId !== undefined
              ? exists(
                  ctx.db
                    .select()
                    .from(tagsOnBookmarks)
                    .where(
                      and(
                        eq(tagsOnBookmarks.bookmarkId, bookmarks.id),
                        eq(tagsOnBookmarks.tagId, input.tagId),
                      ),
                    ),
                )
              : undefined,
            input.rssFeedId !== undefined
              ? exists(
                  ctx.db
                    .select()
                    .from(rssFeedImportsTable)
                    .where(
                      and(
                        eq(rssFeedImportsTable.bookmarkId, bookmarks.id),
                        eq(rssFeedImportsTable.rssFeedId, input.rssFeedId),
                      ),
                    ),
                )
              : undefined,
            input.listId !== undefined
              ? exists(
                  ctx.db
                    .select()
                    .from(bookmarksInLists)
                    .where(
                      and(
                        eq(bookmarksInLists.bookmarkId, bookmarks.id),
                        eq(bookmarksInLists.listId, input.listId),
                      ),
                    ),
                )
              : undefined,
            input.cursor
              ? input.sortOrder === "asc"
                ? or(
                    gt(bookmarks.createdAt, input.cursor.createdAt),
                    and(
                      eq(bookmarks.createdAt, input.cursor.createdAt),
                      lt(bookmarks.id, input.cursor.id),
                    ),
                  )
                : or(
                    lt(bookmarks.createdAt, input.cursor.createdAt),
                    and(
                      eq(bookmarks.createdAt, input.cursor.createdAt),
                      lte(bookmarks.id, input.cursor.id),
                    ),
                  )
              : undefined,
          ),
        )
        .limit(input.limit + 1)
        .orderBy(
          input.sortOrder === "asc"
            ? asc(bookmarks.createdAt)
            : desc(bookmarks.createdAt),
          desc(bookmarks.id),
        ),
    );
    const baseRows = await ctx.db
      .with(sq)
      .select()
      .from(sq)
      .orderBy(desc(sq.createdAt), desc(sq.id));

    if (baseRows.length === 0) {
      return { bookmarks: [], nextCursor: null };
    }

    const bookmarkMap = new Map<string, ZBookmark>();
    for (const row of baseRows) {
      bookmarkMap.set(row.id, {
        ...row,
        content: {
          type: BookmarkTypes.UNKNOWN,
        },
        tags: [],
        assets: [],
      });
    }

    const bookmarkIds = Array.from(bookmarkMap.keys());

    const [linkRows, textRows, assetBookmarkRows, attachmentRows, tagRows] =
      await Promise.all([
        ctx.db
          .select()
          .from(bookmarkLinks)
          .where(inArray(bookmarkLinks.id, bookmarkIds)),
        ctx.db
          .select()
          .from(bookmarkTexts)
          .where(inArray(bookmarkTexts.id, bookmarkIds)),
        ctx.db
          .select()
          .from(bookmarkAssets)
          .where(inArray(bookmarkAssets.id, bookmarkIds)),
        ctx.db
          .select()
          .from(assets)
          .where(inArray(assets.bookmarkId, bookmarkIds)),
        ctx.db.query.tagsOnBookmarks.findMany({
          where: inArray(tagsOnBookmarks.bookmarkId, bookmarkIds),
          with: {
            tag: true,
          },
        }),
      ]);

    for (const link of linkRows) {
      const target = bookmarkMap.get(link.id);
      if (!target) continue;
      target.content = {
        type: BookmarkTypes.LINK,
        url: link.url,
        title: link.title,
        description: link.description,
        imageUrl: link.imageUrl,
        favicon: link.favicon,
        htmlContent: input.includeContent ? link.htmlContent : null,
        crawledAt: link.crawledAt,
        author: link.author,
        publisher: link.publisher,
        datePublished: link.datePublished,
        dateModified: link.dateModified,
      };
    }

    for (const text of textRows) {
      const target = bookmarkMap.get(text.id);
      if (!target) continue;
      target.content = {
        type: BookmarkTypes.TEXT,
        text: text.text ?? "",
        sourceUrl: text.sourceUrl ?? null,
      };
    }

    for (const assetBookmark of assetBookmarkRows) {
      const target = bookmarkMap.get(assetBookmark.id);
      if (!target) continue;
      target.content = {
        type: BookmarkTypes.ASSET,
        assetId: assetBookmark.assetId,
        assetType: assetBookmark.assetType,
        fileName: assetBookmark.fileName,
        sourceUrl: assetBookmark.sourceUrl ?? null,
        size: null,
        content: input.includeContent ? (assetBookmark.content ?? null) : null,
      };
    }

    for (const tagRow of tagRows) {
      const bookmarkId = tagRow.bookmarkId;
      if (!bookmarkId) continue;
      const target = bookmarkMap.get(bookmarkId);
      if (!target) continue;
      if (target.tags.some((tag) => tag.id === tagRow.tag.id)) {
        continue;
      }
      target.tags.push({
        ...tagRow.tag,
        attachedBy: tagRow.attachedBy,
      });
    }

    for (const attachment of attachmentRows) {
      const bookmarkId = attachment.bookmarkId;
      if (!bookmarkId) continue;
      const target = bookmarkMap.get(bookmarkId);
      if (!target) continue;
      if (target.assets.some((asset) => asset.id === attachment.id)) {
        continue;
      }

      if (target.content.type === BookmarkTypes.LINK) {
        const content = target.content;
        invariant(content.type === BookmarkTypes.LINK);
        switch (attachment.assetType) {
          case AssetTypes.LINK_SCREENSHOT:
            content.screenshotAssetId = attachment.id;
            break;
          case AssetTypes.LINK_FULL_PAGE_ARCHIVE:
            content.fullPageArchiveAssetId = attachment.id;
            break;
          case AssetTypes.LINK_BANNER_IMAGE:
            content.imageAssetId = attachment.id;
            break;
          case AssetTypes.LINK_VIDEO:
            content.videoAssetId = attachment.id;
            break;
          case AssetTypes.LINK_PRECRAWLED_ARCHIVE:
            content.precrawledArchiveAssetId = attachment.id;
            break;
          default:
            break;
        }
        target.content = content;
      }

      if (target.content.type === BookmarkTypes.ASSET) {
        const content = target.content;
        if (attachment.id === content.assetId) {
          content.size = attachment.size;
        }
        target.content = content;
      }

      target.assets.push({
        id: attachment.id,
        assetType: mapDBAssetTypeToUserType(attachment.assetType),
      });
    }

    const bookmarksArr = Array.from(bookmarkMap.values());

    bookmarksArr.sort((a, b) => {
      if (a.createdAt != b.createdAt) {
        return input.sortOrder === "asc"
          ? a.createdAt.getTime() - b.createdAt.getTime()
          : b.createdAt.getTime() - a.createdAt.getTime();
      } else {
        return b.id.localeCompare(a.id);
      }
    });

    let nextCursor = null;
    if (bookmarksArr.length > input.limit) {
      const nextItem = bookmarksArr.pop()!;
      nextCursor = {
        id: nextItem.id,
        createdAt: nextItem.createdAt,
      };
    }

    return {
      bookmarks: bookmarksArr.map((b) => Bookmark.fromData(ctx, b)),
      nextCursor,
    };
  }

  asZBookmark(): ZBookmark {
    return this.bookmark;
  }

  asPublicBookmark(): ZPublicBookmark {
    const getPublicSignedAssetUrl = (assetId: string) => {
      const payload: z.infer<typeof zAssetSignedTokenSchema> = {
        assetId,
        userId: this.ctx.user.id,
      };
      const signedToken = createSignedToken(
        payload,
        serverConfig.signingSecret(),
        // Tokens will expire in 1 hour and will have a grace period of 15mins
        getAlignedExpiry(/* interval */ 3600, /* grace */ 900),
      );
      return `${serverConfig.publicApiUrl}/public/assets/${assetId}?token=${signedToken}`;
    };
    const getContent = (
      content: ZBookmarkContent,
    ): ZPublicBookmark["content"] => {
      switch (content.type) {
        case BookmarkTypes.LINK: {
          return {
            type: BookmarkTypes.LINK,
            url: content.url,
          };
        }
        case BookmarkTypes.TEXT: {
          return {
            type: BookmarkTypes.TEXT,
            text: content.text,
          };
        }
        case BookmarkTypes.ASSET: {
          return {
            type: BookmarkTypes.ASSET,
            assetType: content.assetType,
            assetId: content.assetId,
            assetUrl: getPublicSignedAssetUrl(content.assetId),
            fileName: content.fileName,
            sourceUrl: content.sourceUrl,
          };
        }
        default: {
          throw new Error("Unknown bookmark content type");
        }
      }
    };

    const getBannerImageUrl = (content: ZBookmarkContent): string | null => {
      switch (content.type) {
        case BookmarkTypes.LINK: {
          const assetIdOrUrl = getBookmarkLinkAssetIdOrUrl(content);
          if (!assetIdOrUrl) {
            return null;
          }
          if (assetIdOrUrl.localAsset) {
            return getPublicSignedAssetUrl(assetIdOrUrl.assetId);
          } else {
            return assetIdOrUrl.url;
          }
        }
        case BookmarkTypes.TEXT: {
          return null;
        }
        case BookmarkTypes.ASSET: {
          switch (content.assetType) {
            case "image":
              return `${getPublicSignedAssetUrl(content.assetId)}`;
            case "pdf": {
              const screenshotAssetId = this.bookmark.assets.find(
                (r) => r.assetType === "assetScreenshot",
              )?.id;
              if (!screenshotAssetId) {
                return null;
              }
              return getPublicSignedAssetUrl(screenshotAssetId);
            }
            default: {
              const _exhaustiveCheck: never = content.assetType;
              return null;
            }
          }
        }
        default: {
          throw new Error("Unknown bookmark content type");
        }
      }
    };

    // WARNING: Everything below is exposed in the public APIs, don't use spreads!
    return {
      id: this.bookmark.id,
      createdAt: this.bookmark.createdAt,
      modifiedAt: this.bookmark.modifiedAt,
      title: getBookmarkTitle(this.bookmark),
      tags: this.bookmark.tags.map((t) => t.name),
      content: getContent(this.bookmark.content),
      bannerImageUrl: getBannerImageUrl(this.bookmark.content),
    };
  }
}
