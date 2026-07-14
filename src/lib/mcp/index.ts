import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listPostsTool from "./tools/list-posts";
import getStatsTool from "./tools/get-stats";
import schedulePostTool from "./tools/schedule-post";

// The OAuth issuer MUST be the direct Supabase host, derived from the project
// ref. `import.meta.env.VITE_SUPABASE_PROJECT_ID` is inlined by Vite at build
// time, so the entry stays import-safe (no runtime env read).
const projectRef =
  (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "neural-update-mcp",
  title: "Neural Update — Agente Horvat",
  version: "0.1.0",
  instructions:
    "Ferramentas do app Neural Update para agentes de IA. Use `list_posts` para ver posts do usuário autenticado, `get_stats` para métricas agregadas de Instagram e `schedule_post` para agendar rascunhos existentes. Todas as ferramentas respeitam RLS por usuário.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listPostsTool, getStatsTool, schedulePostTool],
});
