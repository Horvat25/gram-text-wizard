import { useState } from "react";
import { Mail, Loader2, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const emailSchema = z
  .string()
  .trim()
  .email({ message: "Email inválido" })
  .max(255, { message: "Email muito longo" });

export const NewsletterForm = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message || "Email inválido");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("newsletter_subscribers").insert({
      email: parsed.data,
      source: "portal_footer",
    });
    setLoading(false);
    if (error && !error.message.includes("duplicate")) {
      toast.error("Não foi possível inscrever. Tente novamente.");
      return;
    }
    setSuccess(true);
    setEmail("");
    toast.success("Inscrição confirmada! Em breve você receberá nossas novidades.");
  };

  if (success) {
    return (
      <div className="flex items-center gap-2 text-sm text-primary">
        <CheckCircle2 className="h-4 w-4" />
        <span>Inscrição confirmada</span>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Receba o resumo diário das principais notícias de tecnologia.
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            required
            disabled={loading}
            className="h-9 pl-9 text-sm bg-background/60"
          />
        </div>
        <Button type="submit" size="sm" disabled={loading} className="shrink-0 h-9">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Inscrever"}
        </Button>
      </div>
    </form>
  );
};
