"use client";

import "@/styles/features/settings.css";
import React, { useState } from "react";
import {
  AlertTriangle,
  Apple,
  Check,
  ExternalLink,
  Info,
  Monitor,
  ShieldAlert,
  Smartphone,
  Wrench,
} from "lucide-react";
import { useUncensoredMode } from "@/lib/uncensored-mode";
import { useToast } from "@/components/ToastProvider";
import { useConfirm } from "@/components/ConfirmProvider";

export function UncensoredModeSettings({ compact = false }: { compact?: boolean }) {
  const [enabled, toggle, mounted] = useUncensoredMode();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const handleToggle = async () => {
    if (busy || !mounted) return;

    if (!enabled) {
      // Confirmação com aviso obrigatório de isenção de responsabilidade
      const accepted = await confirm({
        title: "Ativar Modo Sem Censura?",
        description:
          "Ao ativar o Modo Sem Censura, o botão 'Assistir agora' aparecerá na página de cada filme e série, redirecionando para reprodutores e sites externos. Você declara e confirma estar ciente de que a equipe do MyCatalog NÃO se responsabiliza por conteúdos, anúncios, pop-ups ou segurança de sites de terceiros?",
        confirmLabel: "Estou ciente e aceito",
        cancelLabel: "Cancelar",
        danger: false,
      });

      if (!accepted) return;

      setBusy(true);
      try {
        toggle(true);
        toast.success("Modo Sem Censura ativado!", {
          description: "O botão 'Assistir agora' agora está visível nas páginas de filmes e séries e salvo na sua conta.",
        });
      } finally {
        setBusy(false);
      }
    } else {
      setBusy(true);
      try {
        toggle(false);
        toast.info("Modo Sem Censura desativado.", {
          description: "O botão 'Assistir agora' foi ocultado em todo o site e desativado na sua conta.",
        });
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <section
      id="uncensored-mode"
      className={`panel settings-panel account-settings-panel uncensored-mode-card ${
        compact ? "uncensored-compact" : ""
      }`}
      aria-labelledby="uncensored-mode-title"
    >
      <div className="settings-panel-head">
        <div className="settings-icon">
          <ShieldAlert size={18} aria-hidden="true" />
        </div>
        <div>
          <h2 id="uncensored-mode-title">Modo Sem Censura</h2>
          <p className="muted">
            Controle de exibição do botão direto de reprodução externa nos filmes e séries (salvo na sua conta).
          </p>
        </div>
      </div>

      {/* Caixa explicativa: O que acontece após ativar */}
      <div className="uncensored-info-box" role="region" aria-label="O que acontece após ativar">
        <div className="uncensored-info-head">
          <Info size={18} aria-hidden="true" />
          <strong>O que acontece ao ativar este modo?</strong>
        </div>
        <ul className="uncensored-info-list">
          <li>
            <strong>Botão &ldquo;Assistir agora&rdquo;:</strong> Passa a ser exibido no topo de cada página de filme ou série do catálogo.
          </li>
          <li>
            <strong>Redirecionamento externo:</strong> Ao clicar no botão, nosso sistema pesquisa e redireciona você diretamente para sites e reprodutores externos disponíveis na internet para assistir ao título.
          </li>
          <li>
            <strong>Salvo na sua conta:</strong> A preferência fica salva na sua conta na nuvem — ativando no computador, já estará ativado no celular e vice-versa.
          </li>
          <li>
            <strong>Quando desativado:</strong> O botão é completamente ocultado do site, mantendo apenas as opções normais de biblioteca e plataformas oficiais de streaming.
          </li>
        </ul>
      </div>

      {/* Caixa de Isenção Total de Responsabilidade */}
      <div className="uncensored-disclaimer" role="note" aria-label="Termo de isenção de responsabilidade">
        <div className="uncensored-disclaimer-head">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>Aviso e Isenção Total de Responsabilidade da Equipe</span>
        </div>
        <p className="uncensored-disclaimer-text">
          A equipe do <strong>MyCatalog</strong> atua unicamente como agregadora informativa de dados e títulos cinematográficos.{" "}
          <strong>Nós não hospedamos, não armazenamos, não transmitimos e não gerenciamos</strong> nenhum arquivo de vídeo, stream, servidor ou conteúdo exibido em sites externos.
        </p>
        <p className="uncensored-disclaimer-text">
          <strong>Nós não temos absolutamente nenhuma responsabilidade</strong> pelo que acontecer em outros sites, incluindo anúncios, pop-ups, lentidão, links de terceiros ou segurança da sua navegação.
        </p>
        <p className="uncensored-disclaimer-text">
          O acesso a links externos e a reprodução de conteúdos em outras plataformas são de{" "}
          <strong>sua total e exclusiva responsabilidade e risco</strong>.
        </p>
      </div>

      {/* Linha do Interruptor Switch */}
      <div className="set-row">
        <div className="set-row-copy">
          <strong>Ativar Modo Sem Censura</strong>
          <span>
            {enabled
              ? "Modo ativado: O botão 'Assistir agora' está visível no topo de cada título do catálogo."
              : "Modo desativado: O botão 'Assistir agora' está totalmente oculto."}
          </span>
          <div>
            <span
              className={`uncensored-status-badge ${
                enabled ? "is-active" : "is-inactive"
              }`}
            >
              {enabled ? (
                <>
                  <Check size={12} aria-hidden="true" />
                  Ativado · Botão &ldquo;Assistir agora&rdquo; visível
                </>
              ) : (
                "Desativado · Botão oculto"
              )}
            </span>
          </div>
        </div>

        <div className="set-row-control">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Ativar ou desativar Modo Sem Censura"
            disabled={!mounted || busy}
            className={`set-switch${enabled ? " is-on" : ""}`}
            onClick={handleToggle}
          >
            <span />
          </button>
        </div>
      </div>

      {/* Ferramentas recomendadas para acessar os links externos */}
      <div className="uncensored-tools-section">
        <div className="uncensored-tools-head">
          <Wrench size={18} aria-hidden="true" />
          <div>
            <strong>Ferramentas recomendadas (Provavelmente necessárias para acessar)</strong>
            <span>
              Operadoras de internet brasileiras frequentemente bloqueiam reprodutores externos por DNS e essas páginas contêm pop-ups agressivos. Recomendamos utilizar estas ferramentas oficiais e gratuitas:
            </span>
          </div>
        </div>

        <div className="uncensored-tools-grid">
          {/* Card Mobile Android */}
          <div className="uncensored-tool-card">
            <div className="uncensored-tool-badge">
              <Smartphone size={14} aria-hidden="true" />
              <span>Android</span>
            </div>
            <h4>No Celular Android</h4>
            <p>Bloqueie pop-ups agressivos e contorne bloqueios de operadora no seu celular:</p>
            <div className="uncensored-tool-actions">
              <a
                href="https://play.google.com/store/apps/details?id=com.brave.browser"
                target="_blank"
                rel="noopener noreferrer"
                className="btn uncensored-tool-btn"
              >
                <ExternalLink size={13} aria-hidden="true" />
                Brave Browser (Play Store)
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.cloudflare.onedotonedotonedotone"
                target="_blank"
                rel="noopener noreferrer"
                className="btn uncensored-tool-btn"
              >
                <ExternalLink size={13} aria-hidden="true" />
                1.1.1.1 WARP (Play Store)
              </a>
            </div>
            <small className="muted">
              💡 Dica sem app: Configurações do Android ➔ Rede ➔ DNS Privado: <code>one.one.one.one</code>
            </small>
          </div>

          {/* Card Mobile iOS */}
          <div className="uncensored-tool-card">
            <div className="uncensored-tool-badge">
              <Apple size={14} aria-hidden="true" />
              <span>iOS (iPhone / iPad)</span>
            </div>
            <h4>No iPhone & iPad</h4>
            <p>Navegue sem anúncios invasivos e garanta a conexão sem travamentos de operadora:</p>
            <div className="uncensored-tool-actions">
              <a
                href="https://apps.apple.com/app/brave-private-web-browser/id1052879175"
                target="_blank"
                rel="noopener noreferrer"
                className="btn uncensored-tool-btn"
              >
                <ExternalLink size={13} aria-hidden="true" />
                Brave Browser (App Store)
              </a>
              <a
                href="https://apps.apple.com/app/1-1-1-1-faster-internet/id1423538627"
                target="_blank"
                rel="noopener noreferrer"
                className="btn uncensored-tool-btn"
              >
                <ExternalLink size={13} aria-hidden="true" />
                1.1.1.1 WARP (App Store)
              </a>
            </div>
          </div>

          {/* Card PC */}
          <div className="uncensored-tool-card">
            <div className="uncensored-tool-badge">
              <Monitor size={14} aria-hidden="true" />
              <span>Computador (PC / Mac)</span>
            </div>
            <h4>No Computador</h4>
            <p>Desbloqueie links barrados por operadoras locais e assista com reprodutor limpo:</p>
            <div className="uncensored-tool-actions">
              <a
                href="https://1.1.1.1/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn uncensored-tool-btn"
              >
                <ExternalLink size={13} aria-hidden="true" />
                1.1.1.1 WARP (Cloudflare)
              </a>
              <a
                href="https://brave.com/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn uncensored-tool-btn"
              >
                <ExternalLink size={13} aria-hidden="true" />
                Brave Browser (PC)
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default UncensoredModeSettings;
