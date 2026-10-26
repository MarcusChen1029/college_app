import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, parseLocale, type Locale } from "./core.ts";
import { makeT, type TFunction } from "./index.ts";

/**
 * The visitor's language from the cookie. cookies() is request data: under cacheComponents call this only below a
 * <Suspense> boundary (every page is, through the one in app/layout.tsx), and never inside a "use cache" function;
 * pass the locale in as an argument instead.
 */
export async function getLocale(): Promise<Locale> {
  return parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

/** `const t = await getT();` for server components. */
export async function getT(): Promise<TFunction> {
  return makeT(await getLocale());
}
