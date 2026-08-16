"use client";

import {
  ChangeEvent,
  useRef,
  useState,
} from "react";

import {
  ArchiveRestore,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  Upload,
} from "lucide-react";

import {
  useToast,
} from "@/components/ToastProvider";

function downloadBlob(
  blob:
    Blob,
  filename:
    string
) {
  const url =
    URL.createObjectURL(
      blob
    );

  const link =
    document.createElement(
      "a"
    );

  link.href =
    url;

  link.download =
    filename;

  document.body
    .appendChild(
      link
    );

  link.click();

  link.remove();

  URL.revokeObjectURL(
    url
  );
}

export function DataBackup() {
  const toast =
    useToast();

  const inputRef =
    useRef<
      HTMLInputElement |
      null
    >(
      null
    );

  const [
    exporting,
    setExporting,
  ] =
    useState<
      "json" |
      "csv" |
      null
    >(null);

  const [
    importing,
    setImporting,
  ] =
    useState(false);

  const [
    pendingBackup,
    setPendingBackup,
  ] =
    useState<
      any |
      null
    >(null);

  const [
    pendingName,
    setPendingName,
  ] =
    useState("");

  async function exportData(
    format:
      "json" |
      "csv"
  ) {
    try {
      setExporting(
        format
      );

      const response =
        await fetch(
          `/api/account/export?format=${format}`
        );

      if (
        !response.ok
      ) {
        const data =
          await response
            .json()
            .catch(
              () => null
            );

        throw new Error(
          data?.error ||
            "Não foi possível exportar."
        );
      }

      const blob =
        await response.blob();

      const day =
        new Date()
          .toISOString()
          .slice(
            0,
            10
          );

      downloadBlob(
        blob,
        format ===
          "json"
          ? `mycatalog-backup-${day}.json`
          : `mycatalog-library-${day}.csv`
      );

      toast.success(
        format ===
          "json"
          ? "Backup completo exportado"
          : "Biblioteca CSV exportada"
      );
    } catch (
      error
    ) {
      toast.error(
        "Erro ao exportar",
        {
          description:
            error instanceof Error
              ? error.message
              : "Tente novamente.",
        }
      );
    } finally {
      setExporting(
        null
      );
    }
  }

  async function selectBackup(
    event:
      ChangeEvent<
        HTMLInputElement
      >
  ) {
    const file =
      event.target
        .files?.[
          0
        ];

    event.target.value =
      "";

    if (
      !file
    ) {
      return;
    }

    const maxBackupBytes =
  10 * 1024 * 1024;

if (
  file.size >
  maxBackupBytes
) {
  toast.error(
    "Backup muito grande",
    {
      description:
        "O arquivo deve ter no máximo 10 MB."
    }
  );

  return;
}
    
    try {
      const text =
        await file.text();

      const parsed =
        JSON.parse(
          text
        );

      if (
        !parsed
          ?.mycatalog_backup ||
        Number(
          parsed.version
        ) !==
          1
      ) {
        throw new Error(
          "Este arquivo não parece ser um backup válido do MyCatalog."
        );
      }

      setPendingBackup(
        parsed
      );

      setPendingName(
        file.name
      );
    } catch (
      error
    ) {
      toast.error(
        "Backup inválido",
        {
          description:
            error instanceof Error
              ? error.message
              : "Não foi possível ler o arquivo.",
        }
      );
    }
  }

  async function importBackup() {
    if (
      !pendingBackup
    ) {
      return;
    }

    try {
      setImporting(
        true
      );

      const response =
        await fetch(
          "/api/account/import",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                pendingBackup
              ),
          }
        );

      const data =
        await response
          .json();

      if (
        !response.ok ||
        data?.error
      ) {
        throw new Error(
          data?.error ||
            "Não foi possível restaurar."
        );
      }

      setPendingBackup(
        null
      );

      setPendingName(
        ""
      );

      toast.success(
        "Backup restaurado",
        {
          description:
            `${data.restored?.library || 0} títulos e ${data.restored?.watch_history || 0} visualizações processados.`,
        }
      );
    } catch (
      error
    ) {
      toast.error(
        "Erro ao restaurar",
        {
          description:
            error instanceof Error
              ? error.message
              : "Tente novamente.",
        }
      );
    } finally {
      setImporting(
        false
      );
    }
  }

  return (
    <section
      id="your-data"
      className="panel settings-panel data-backup-panel"
    >
      <div className="settings-panel-head">
        <div className="settings-icon">
          <Database
            size={19}
          />
        </div>

        <div>
          <h2>
            Seus dados
          </h2>

          <p className="muted">
            Baixe uma cópia da sua conta ou restaure um backup do MyCatalog.
          </p>
        </div>
      </div>

      <div className="data-backup-grid">
        <article className="data-backup-card">
          <div className="data-backup-card-icon">
            <FileJson
              size={19}
            />
          </div>

          <div>
            <strong>
              Backup completo
            </strong>

            <p>
              Biblioteca, notas, reviews, progresso, histórico de visualizações, Diário e títulos sem interesse.
            </p>
          </div>

          <button
            type="button"
            className="btn primary"
            disabled={
              exporting !==
              null
            }
            onClick={() =>
              exportData(
                "json"
              )
            }
          >
            {exporting ===
            "json" ? (
              <Loader2
                size={15}
                className="spin"
              />
            ) : (
              <Download
                size={15}
              />
            )}

            Exportar backup
          </button>
        </article>

        <article className="data-backup-card">
          <div className="data-backup-card-icon">
            <FileSpreadsheet
              size={19}
            />
          </div>

          <div>
            <strong>
              Biblioteca em CSV
            </strong>

            <p>
              Uma planilha simples para abrir no Excel, Google Sheets ou guardar fora do site.
            </p>
          </div>

          <button
            type="button"
            className="btn"
            disabled={
              exporting !==
              null
            }
            onClick={() =>
              exportData(
                "csv"
              )
            }
          >
            {exporting ===
            "csv" ? (
              <Loader2
                size={15}
                className="spin"
              />
            ) : (
              <Download
                size={15}
              />
            )}

            Exportar CSV
          </button>
        </article>

        <article className="data-backup-card restore">
          <div className="data-backup-card-icon">
            <ArchiveRestore
              size={19}
            />
          </div>

          <div>
            <strong>
              Restaurar backup
            </strong>

            <p>
              O modo de restauração é por mesclagem: ele atualiza títulos existentes e adiciona os que estiverem faltando.
            </p>
          </div>

          <input
            ref={
              inputRef
            }
            type="file"
            accept="application/json,.json"
            hidden
            onChange={
              selectBackup
            }
          />

          <button
            type="button"
            className="btn"
            onClick={() =>
              inputRef.current
                ?.click()
            }
          >
            <Upload
              size={15}
            />

            Selecionar backup
          </button>
        </article>
      </div>

      <div className="data-backup-safety">
        <ShieldCheck
          size={17}
        />

        <div>
          <strong>
            Backup portátil
          </strong>

          <span>
            O arquivo JSON usa uma versão identificada, para futuras mudanças do banco poderem ser tratadas sem quebrar backups antigos.
          </span>
        </div>
      </div>

      {pendingBackup && (
        <div className="mycatalog-confirm-backdrop">
          <div className="mycatalog-confirm-modal">
            <div className="mycatalog-confirm-icon">
              <ArchiveRestore
                size={20}
              />
            </div>

            <div className="eyebrow">
              RESTAURAR BACKUP
            </div>

            <h3>
              Importar {pendingName}?
            </h3>

            <p className="muted">
              Seus dados atuais não serão apagados. O MyCatalog vai mesclar o backup com a conta atual.
            </p>

            <div className="mycatalog-confirm-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setPendingBackup(
                    null
                  );

                  setPendingName(
                    ""
                  );
                }}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="btn primary"
                disabled={
                  importing
                }
                onClick={
                  importBackup
                }
              >
                {importing ? (
                  <Loader2
                    size={15}
                    className="spin"
                  />
                ) : (
                  <ArchiveRestore
                    size={15}
                  />
                )}

                Restaurar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}