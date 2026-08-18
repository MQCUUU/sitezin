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

  const letterboxdInputRef = useRef<HTMLInputElement | null>(null);
  const [letterboxdRows, setLetterboxdRows] = useState<any[]>([]);
  const [letterboxdName, setLetterboxdName] = useState("");
  const [letterboxdImporting, setLetterboxdImporting] = useState(false);

  function parseCsv(text: string) {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;

    for (let index = 0; index < text.length; index++) {
      const char = text[index];
      if (char === '"' && quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(cell);
        cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[index + 1] === "\n") index++;
        row.push(cell);
        if (row.some(Boolean)) rows.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    row.push(cell);
    if (row.some(Boolean)) rows.push(row);
    return rows;
  }

  async function selectLetterboxd(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("CSV muito grande", { description: "O arquivo deve ter no máximo 5 MB." });
      return;
    }

    try {
      const csv = parseCsv(await file.text());
      const headers = (csv.shift() || []).map((value) => value.trim().toLowerCase());
      const column = (name: string) => headers.indexOf(name.toLowerCase());
      const source = headers.includes("watched date")
        ? "diary"
        : file.name.toLowerCase().includes("watchlist")
          ? "watchlist"
          : "ratings";

      if (column("Name") < 0) throw new Error("A coluna Name não foi encontrada.");

      const parsed = csv.map((values) => ({
        name: values[column("Name")]?.trim(),
        year: Number(values[column("Year")]) || null,
        rating: Number(values[column("Rating")]) || null,
        watchedDate: values[column("Watched Date")]?.trim() || null,
        rewatch: /^(yes|true|1)$/i.test(values[column("Rewatch")] || ""),
        source,
      })).filter((item) => item.name).slice(0, 1000);

      if (!parsed.length) throw new Error("Nenhum filme foi encontrado no arquivo.");
      setLetterboxdRows(parsed);
      setLetterboxdName(file.name);
    } catch (error) {
      toast.error("CSV inválido", {
        description: error instanceof Error ? error.message : "Não foi possível ler o arquivo.",
      });
    }
  }

  async function importLetterboxd() {
    try {
      setLetterboxdImporting(true);
      const total = { imported: 0, history: 0, notFound: 0 };

      // Lotes menores evitam o limite de duração das funções da Vercel.
      for (let start = 0; start < letterboxdRows.length; start += 40) {
        const response = await fetch("/api/account/import/letterboxd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: letterboxdRows.slice(start, start + 40) }),
        });
        const data = await response.json();
        if (!response.ok || data?.error) throw new Error(data?.error || "Não foi possível importar.");

        total.imported += Number(data.imported || 0);
        total.history += Number(data.history || 0);
        total.notFound += Number(data.not_found?.length || 0);
      }

      setLetterboxdRows([]);
      setLetterboxdName("");
      toast.success("Letterboxd importado", {
        description: `${total.imported} filmes e ${total.history} registros do diário processados. ${total.notFound} não encontrados.`,
      });
    } catch (error) {
      toast.error("Erro ao importar", {
        description: error instanceof Error ? error.message : "Tente novamente.",
      });
    } finally {
      setLetterboxdImporting(false);
    }
  }

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

        <article className="data-backup-card restore">
          <div className="data-backup-card-icon">
            <FileSpreadsheet size={19} />
          </div>

          <div>
            <strong>Importar do Letterboxd</strong>
            <p>Importe diary.csv, ratings.csv ou watchlist.csv. A importação mescla os filmes sem apagar sua biblioteca.</p>
          </div>

          <input
            ref={letterboxdInputRef}
            type="file"
            accept="text/csv,.csv"
            hidden
            onChange={selectLetterboxd}
          />

          <button type="button" className="btn" onClick={() => letterboxdInputRef.current?.click()}>
            <Upload size={15} /> Selecionar CSV
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

      {letterboxdRows.length > 0 && (
        <div className="mycatalog-confirm-backdrop">
          <div className="mycatalog-confirm-modal">
            <div className="mycatalog-confirm-icon"><FileSpreadsheet size={20} /></div>
            <div className="eyebrow">IMPORTAR LETTERBOXD</div>
            <h3>Importar {letterboxdName}?</h3>
            <p className="muted">
              Encontramos {letterboxdRows.length} registros. Exemplo: {letterboxdRows.slice(0, 3).map((item) => `${item.name}${item.year ? ` (${item.year})` : ""}`).join(", ")}.
            </p>
            <p className="muted">Os títulos existentes serão mesclados e nenhum dado atual será apagado.</p>
            <div className="mycatalog-confirm-actions">
              <button type="button" className="btn" disabled={letterboxdImporting} onClick={() => { setLetterboxdRows([]); setLetterboxdName(""); }}>Cancelar</button>
              <button type="button" className="btn primary" disabled={letterboxdImporting} onClick={importLetterboxd}>
                {letterboxdImporting ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
                {letterboxdImporting ? "Localizando filmes..." : "Importar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
