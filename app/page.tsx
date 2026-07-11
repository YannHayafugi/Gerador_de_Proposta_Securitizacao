"use client";

import { useState } from "react";
import { Etapa, PropostaFormData, TipoEnte, Tratamento } from "@/lib/types";
import { ETAPAS_PADRAO } from "@/lib/etapasPadrao";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const hoje = new Date();

function novaEtapaVazia(): Etapa {
  return { titulo: "", atividades: "", periodo: "" };
}

export default function Home() {
  const [tipoEnte, setTipoEnte] = useState<TipoEnte>("Município");
  const [nomeEnte, setNomeEnte] = useState("São Roque");
  const [uf, setUf] = useState("SP");

  const [dataDia, setDataDia] = useState(hoje.getDate());
  const [dataMes, setDataMes] = useState(hoje.getMonth() + 1);
  const [dataAno, setDataAno] = useState(hoje.getFullYear());

  const [tratamento, setTratamento] = useState<Tratamento>("Senhor");
  const [nomeDestinatario, setNomeDestinatario] = useState("");
  const [cargoDestinatario, setCargoDestinatario] = useState("");

  const [prazoMeses, setPrazoMeses] = useState(12);
  const [honorarios, setHonorarios] = useState("513348,00");
  const [parcelas, setParcelas] = useState(12);

  const [etapas, setEtapas] = useState<Etapa[]>(ETAPAS_PADRAO);

  const [gerando, setGerando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const anos = Array.from({ length: 6 }, (_, i) => hoje.getFullYear() + i - 1);
  const dias = Array.from({ length: 31 }, (_, i) => i + 1);
  const mesesOpts = MESES.map((m, i) => ({ valor: i + 1, label: m }));
  const numeros36 = Array.from({ length: 36 }, (_, i) => i + 1);

  function atualizarEtapa(idx: number, campo: keyof Etapa, valor: string) {
    setEtapas((prev) => prev.map((e, i) => (i === idx ? { ...e, [campo]: valor } : e)));
  }

  function adicionarEtapa() {
    setEtapas((prev) => [...prev, novaEtapaVazia()]);
  }

  function removerEtapa(idx: number) {
    setEtapas((prev) => prev.filter((_, i) => i !== idx));
  }

  function moverEtapa(idx: number, direcao: -1 | 1) {
    setEtapas((prev) => {
      const novo = [...prev];
      const alvo = idx + direcao;
      if (alvo < 0 || alvo >= novo.length) return prev;
      [novo[idx], novo[alvo]] = [novo[alvo], novo[idx]];
      return novo;
    });
  }

  function parseHonorarios(valor: string): number {
    const limpo = valor.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
    const n = parseFloat(limpo);
    return isNaN(n) ? 0 : n;
  }

  async function gerarDocumento() {
    setMensagem(null);

    if (!nomeEnte.trim() || !nomeDestinatario.trim() || !cargoDestinatario.trim()) {
      setMensagem({ tipo: "erro", texto: "Preencha ao menos o nome do ente, o destinatário e o cargo." });
      return;
    }
    if (etapas.length === 0) {
      setMensagem({ tipo: "erro", texto: "Adicione ao menos uma etapa ao cronograma." });
      return;
    }

    const payload: PropostaFormData = {
      tipoEnte,
      nomeEnte: nomeEnte.trim(),
      uf: uf.trim(),
      dataDia,
      dataMes,
      dataAno,
      tratamento,
      nomeDestinatario: nomeDestinatario.trim(),
      cargoDestinatario: cargoDestinatario.trim(),
      prazoMeses,
      honorarios: parseHonorarios(honorarios),
      parcelas,
      etapas,
    };

    setGerando(true);
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const erro = await resp.json().catch(() => ({}));
        throw new Error(erro.error || "Falha ao gerar o documento.");
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Proposta - ${tipoEnte} de ${nomeEnte}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setMensagem({ tipo: "ok", texto: "Proposta gerada com sucesso. O download foi iniciado." });
    } catch (err: any) {
      setMensagem({ tipo: "erro", texto: err.message || "Erro inesperado ao gerar o documento." });
    } finally {
      setGerando(false);
    }
  }

  return (
    <main>
      <header className="topo">
        <h1>Gerador de Propostas – Securitização</h1>
        <p>FIA – Fundação Instituto de Administração</p>
      </header>

      <div className="page">
        <section className="card">
          <h2>1. Ente contratante</h2>
          <div className="grid">
            <div className="field">
              <label>Tipo de ente</label>
              <select value={tipoEnte} onChange={(e) => setTipoEnte(e.target.value as TipoEnte)}>
                <option value="Município">Município</option>
                <option value="Estado">Estado</option>
              </select>
            </div>
            <div className="field">
              <label>Nome do ente</label>
              <input
                value={nomeEnte}
                onChange={(e) => setNomeEnte(e.target.value)}
                placeholder="Ex.: São Roque"
              />
              <small>Sem o prefixo &quot;Município de&quot; / &quot;Estado do&quot;.</small>
            </div>
            <div className="field">
              <label>UF</label>
              <input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} maxLength={2} placeholder="SP" />
            </div>
          </div>
        </section>

        <section className="card">
          <h2>2. Data de emissão</h2>
          <div className="grid">
            <div className="field">
              <label>Dia</label>
              <select value={dataDia} onChange={(e) => setDataDia(Number(e.target.value))}>
                {dias.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Mês</label>
              <select value={dataMes} onChange={(e) => setDataMes(Number(e.target.value))}>
                {mesesOpts.map((m) => (
                  <option key={m.valor} value={m.valor}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Ano</label>
              <select value={dataAno} onChange={(e) => setDataAno(Number(e.target.value))}>
                {anos.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>
          <small>Será exibida no documento como: {dataDia} de {MESES[dataMes - 1]} de {dataAno}</small>
        </section>

        <section className="card">
          <h2>3. Destinatário</h2>
          <div className="grid">
            <div className="field">
              <label>Tratamento</label>
              <select value={tratamento} onChange={(e) => setTratamento(e.target.value as Tratamento)}>
                <option value="Senhor">Senhor</option>
                <option value="Senhora">Senhora</option>
              </select>
            </div>
            <div className="field">
              <label>Nome do destinatário</label>
              <input value={nomeDestinatario} onChange={(e) => setNomeDestinatario(e.target.value)} />
            </div>
            <div className="field">
              <label>Cargo</label>
              <input value={cargoDestinatario} onChange={(e) => setCargoDestinatario(e.target.value)} placeholder="Ex.: Prefeito Municipal" />
            </div>
          </div>
        </section>

        <section className="card">
          <h2>4. Prazo e honorários</h2>
          <div className="grid">
            <div className="field">
              <label>Prazo do contrato (meses)</label>
              <select value={prazoMeses} onChange={(e) => setPrazoMeses(Number(e.target.value))}>
                {numeros36.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Honorários (R$)</label>
              <input value={honorarios} onChange={(e) => setHonorarios(e.target.value)} placeholder="513348,00" />
            </div>
            <div className="field">
              <label>Parcelas</label>
              <select value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>
                {numeros36.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="card">
          <h2>5. Cronograma (Etapas / Atividades / Período)</h2>
          <p style={{ fontSize: 13, color: "#667085", marginTop: -8 }}>
            Cada etapa é numerada automaticamente em algarismos romanos (Etapa I, II, III...) na ordem em que
            aparece abaixo. No campo &quot;Atividades&quot;, use <code>**texto**</code> para títulos de grupo em
            negrito e recue com espaços as sub-atividades numeradas.
          </p>

          {etapas.map((etapa, idx) => (
            <div className="etapa-card" key={idx}>
              <button
                type="button"
                className="etapa-remove"
                onClick={() => removerEtapa(idx)}
                title="Remover etapa"
              >
                remover ✕
              </button>
              <span className="etapa-badge">Etapa {toRomanPreview(idx + 1)}</span>
              <div className="field">
                <label>Título da etapa</label>
                <input
                  value={etapa.titulo}
                  onChange={(e) => atualizarEtapa(idx, "titulo", e.target.value)}
                  placeholder="Ex.: Análise Legal e Normativa"
                />
              </div>
              <div className="field">
                <label>Atividades</label>
                <textarea
                  value={etapa.atividades}
                  onChange={(e) => atualizarEtapa(idx, "atividades", e.target.value)}
                  rows={8}
                />
              </div>
              <div className="field">
                <label>Período</label>
                <input
                  value={etapa.periodo}
                  onChange={(e) => atualizarEtapa(idx, "periodo", e.target.value)}
                  placeholder="Ex.: 1º mês"
                />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn secondary" onClick={() => moverEtapa(idx, -1)} disabled={idx === 0}>
                  mover para cima
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => moverEtapa(idx, 1)}
                  disabled={idx === etapas.length - 1}
                >
                  mover para baixo
                </button>
              </div>
            </div>
          ))}

          <button type="button" className="btn secondary" onClick={adicionarEtapa}>
            + adicionar etapa
          </button>
        </section>

        <div className="actions">
          <button className="btn" onClick={gerarDocumento} disabled={gerando}>
            {gerando ? "Gerando documento..." : "Gerar proposta (.docx)"}
          </button>
          {mensagem && <span className={`msg ${mensagem.tipo}`}>{mensagem.texto}</span>}
        </div>
      </div>
    </main>
  );
}

function toRomanPreview(num: number): string {
  const valores: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let n = num;
  let out = "";
  for (const [v, s] of valores) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}
