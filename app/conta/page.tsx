"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Página de autoatendimento para o usuário logado trocar a própria senha. */
export default function MinhaContaPage() {
  const [email, setEmail] = useState<string | null>(null);

  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function trocarSenha() {
    setMensagem(null);

    if (novaSenha.length < 6) {
      setMensagem({ tipo: "erro", texto: "A nova senha precisa ter pelo menos 6 caracteres." });
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setMensagem({ tipo: "erro", texto: "As senhas não coincidem." });
      return;
    }

    setSalvando(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw new Error(error.message);

      setMensagem({ tipo: "ok", texto: "Senha alterada com sucesso." });
      setNovaSenha("");
      setConfirmarSenha("");
    } catch (err: any) {
      setMensagem({ tipo: "erro", texto: err.message || "Erro inesperado ao trocar a senha." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main>
      <header className="topo">
        <h1>Minha conta</h1>
        {email && <p>{email}</p>}
      </header>

      <div className="page">
        <section className="card">
          <h2>Trocar senha</h2>
          <div className="grid">
            <div className="field">
              <label>Nova senha *</label>
              <input
                type="password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Mínimo de 6 caracteres"
              />
            </div>
            <div className="field">
              <label>Confirmar nova senha *</label>
              <input
                type="password"
                value={confirmarSenha}
                onChange={(e) => setConfirmarSenha(e.target.value)}
              />
            </div>
          </div>
          <div className="actions">
            <button className="btn" onClick={trocarSenha} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar nova senha"}
            </button>
            {mensagem && <span className={`msg ${mensagem.tipo}`}>{mensagem.texto}</span>}
          </div>
        </section>
      </div>
    </main>
  );
}
