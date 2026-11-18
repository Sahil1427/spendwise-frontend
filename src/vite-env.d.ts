/// <reference types="vite/client" />

// Vite asset/url-style imports used by lazy-loaded parse libraries.
declare module '*?url' {
  const url: string;
  export default url;
}
