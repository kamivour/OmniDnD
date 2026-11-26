/** Dev-only private monster pack (see vite.config.ts); `undefined` in builds. */
declare module 'virtual:dev-monster-pack' {
  const pack: unknown;
  export default pack;
}
