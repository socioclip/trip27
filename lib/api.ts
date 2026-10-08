// Client-side fetch paths must include the basePath (Next.js only adds it to links and router calls).
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const api = (path: string) => `${BASE_PATH}${path}`;
