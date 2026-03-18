/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare module '*?inline' {
  const content: string;
  export default content;
}

declare module '*.scss?inline' {
  const content: string;
  export default content;
}

declare module '*.css?inline' {
  const content: string;
  export default content;
}
