/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MODELSLAB_API_KEY?: string;
  readonly VITE_MODELSLAB_ENDPOINT?: string;
  readonly VITE_MODELSLAB_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
