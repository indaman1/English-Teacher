// Minimal ambient declarations so the Edge Functions can be type-checked with the project's TypeScript.
// (In the real Deno runtime these globals are provided by Deno itself.)
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};
