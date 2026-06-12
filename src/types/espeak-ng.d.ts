declare module "espeak-ng" {
  interface ESpeakModule {
    FS: {
      writeFile(path: string, data: string | Uint8Array): void;
      readFile(path: string, opts: { encoding: "utf8" }): string;
    };
  }
  interface ESpeakOptions {
    arguments?: string[];
    locateFile?: (path: string) => string;
    preRun?: Array<(mod: ESpeakModule) => void>;
  }
  const ESpeakNg: (opts?: ESpeakOptions) => Promise<ESpeakModule>;
  export default ESpeakNg;
}

declare module "espeak-ng/dist/espeak-ng.wasm?url" {
  const url: string;
  export default url;
}
