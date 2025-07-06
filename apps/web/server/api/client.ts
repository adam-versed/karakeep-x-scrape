import { headers } from "next/headers";
import { getServerAuthSession } from "@/server/auth";
import requestIp from "request-ip";

import { db } from "@karakeep/db";
import { Context, createCallerFactory } from "@karakeep/trpc";
import { authenticateApiKey } from "@karakeep/trpc/auth";
import { appRouter } from "@karakeep/trpc/routers/_app";

export async function createContextFromRequest(req: Request) {
  // TODO: This is a hack until we offer a proper REST API instead of the trpc based one.
  // Check if the request has an Authorization token, if it does, assume that API key authentication is requested.
  const ip = requestIp.getClientIp({
    headers: Object.fromEntries(req.headers.entries()),
  });
  const authorizationHeader = req.headers.get("Authorization");
  if (authorizationHeader && authorizationHeader.startsWith("Bearer ")) {
    // Extract token with proper validation
    const parts = authorizationHeader.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      const token = parts[1];

      // Basic token format validation before attempting authentication
      if (token && token.length > 0 && token.length <= 512) {
        try {
          const user = await authenticateApiKey(token);
          return {
            user,
            db,
            req: {
              ip,
            },
          };
        } catch {
          // Fallthrough to cookie-based auth
        }
      }
    }
  }

  return createContext(db, ip);
}

export const createContext = async (
  database?: typeof db,
  ip?: string | null,
): Promise<Context> => {
  const session = await getServerAuthSession();
  if (ip === undefined) {
    const hdrs = headers();
    ip = requestIp.getClientIp({
      headers: Object.fromEntries(hdrs.entries()),
    });
  }
  return {
    user: session?.user ?? null,
    db: database ?? db,
    req: {
      ip,
    },
  };
};

const createCaller = createCallerFactory(appRouter);

export const api = createCaller(createContext);

export const createTrcpClientFromCtx = createCaller;
