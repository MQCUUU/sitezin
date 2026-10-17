'use client';

import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Bell,
  Database,
  Palette,
  RotateCcw,
  ShieldCheck,
  Star,
  Tv,
  Plus,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

import { Search } from '@/components/Search';
import { DataBackup } from '@/components/DataBackup';
import { AccountPrivacy } from '@/components/AccountPrivacy';
import { SocialSettings } from '@/components/SocialSettings';
import { NotificationSettings } from '@/components/NotificationSettings';
import { StreamingServicesSettings } from '@/components/StreamingServicesSettings';
import { HiddenTitlesSettings } from '@/components/HiddenTitlesSettings';

import {
  ACCENT_OPTIONS,
  DEFAULT_PREFERENCES,
  type AppearancePreferences,
  readPreferences,
  savePreferences,
} from '@/lib/preferences';

/*
 * V2.3 — Configurações reorganizadas como um app:
 *  - uma lista curta de seções à esquerda (chips roláveis no celular);
 *  - cada seção mostra SÓ o que é dela, em linhas "rótulo + controle";
 *  - preferências aplicam e salvam na hora (sem botão "salvar");
 *  - a aba fica na URL (?tab=…), então atualizar a página não perde o lugar;
 *    V3.3: trocar de aba entra no histórico (Voltar/Avançar navegam entre seções).
 * `?tab=general` (links antigos para "Meus serviços") abre Streaming.
 */

type TabId = 'appearance' | 'streaming' | 'notifications' | 'account' | 'ratings' | 'data';

const TABS: { id: TabId; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'appearance', label: 'Aparência', hint: 'Tema, cor e densidade', icon: Palette },
  { id: 'streaming', label: 'Streaming', hint: 'Onde assiste e o que evitar', icon: Tv },
  { id: 'notifications', label: 'Notificações', hint: 'Avisos do site', icon: Bell },
  { id: 'account', label: 'Conta e privacidade', hint: 'Perfil, @, visibilidade', icon: ShieldCheck },
  { id: 'ratings', label: 'Critérios de avaliação', hint: 'Categorias da sua nota', icon: Star },
  { id: 'data', label: 'Dados e backup', hint: 'Exportar e importar', icon: Database },
];

function tabFromQuery(value: string | null): TabId {
  if (value === 'general') return 'streaming';

  return TABS.some((tab) => tab.id === value) ? (value as TabId) : 'appearance';
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-row-copy">
        <strong>{label}</strong>
        {hint ? <span>{hint}</span> : null}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="set-segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={value === option.value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`set-switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

function SectionHead({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <header className="set-section-head">
      <h2 id={id}>{title}</h2>
      <p>{description}</p>
    </header>
  );
}

function AppearanceSection() {
  const [preferences, setPreferences] = useState<AppearancePreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    const sync = () => setPreferences(readPreferences());

    sync();
    // Preferências que chegam da conta (outro aparelho) atualizam a tela aberta.
    window.addEventListener("mycatalog-preferences-updated", sync);

    return () => window.removeEventListener("mycatalog-preferences-updated", sync);
  }, []);

  const change = useCallback(
    <K extends keyof AppearancePreferences>(key: K, value: AppearancePreferences[K]) => {
      setPreferences((current) => {
        const next = { ...current, [key]: value };
        savePreferences(next);
        return next;
      });
    },
    []
  );

  return (
    <section className="set-card" aria-labelledby="set-appearance">
      <SectionHead
        id="set-appearance"
        title="Aparência"
        description="As mudanças aplicam na hora e ficam salvas na sua conta — valem em qualquer aparelho em que você entrar."
      />

      <Row label="Tema">
        <Segmented
          label="Tema"
          value={preferences.theme}
          onChange={(value) => change('theme', value)}
          options={[
            { value: 'dark', label: 'Escuro' },
            { value: 'light', label: 'Claro' },
            { value: 'oled', label: 'OLED' },
          ]}
        />
      </Row>

      <Row label="Cor de destaque">
        <div className="set-swatches" role="radiogroup" aria-label="Cor de destaque">
          {ACCENT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={preferences.accent === option.value}
              aria-label={option.name}
              title={option.name}
              className={preferences.accent === option.value ? 'is-active' : ''}
              style={{ background: option.value }}
              onClick={() => change('accent', option.value)}
            />
          ))}
        </div>
      </Row>

      <Row label="Densidade" hint="Compacta mostra mais títulos por tela.">
        <Segmented
          label="Densidade"
          value={preferences.density}
          onChange={(value) => change('density', value)}
          options={[
            { value: 'comfortable', label: 'Confortável' },
            { value: 'compact', label: 'Compacta' },
          ]}
        />
      </Row>

      <Row label="Cantos">
        <Segmented
          label="Cantos"
          value={preferences.radius}
          onChange={(value) => change('radius', value)}
          options={[
            { value: 'rounded', label: 'Arredondados' },
            { value: 'soft', label: 'Suaves' },
            { value: 'square', label: 'Retos' },
          ]}
        />
      </Row>

      <Row label="Reduzir animações" hint="Menos movimento nas transições e efeitos.">
        <Switch
          label="Reduzir animações"
          checked={preferences.motion === 'reduced'}
          onChange={(value) => change('motion', value ? 'reduced' : 'full')}
        />
      </Row>

      <Row label="Ordem da biblioteca" hint="Como a Biblioteca abre por padrão.">
        <select
          className="set-select"
          aria-label="Ordem padrão da biblioteca"
          value={preferences.defaultSort}
          onChange={(event) => change('defaultSort', event.target.value as AppearancePreferences['defaultSort'])}
        >
          <option value="added">Adicionados recentemente</option>
          <option value="updated">Atualizados recentemente</option>
          <option value="rating">Minha nota</option>
          <option value="tmdb">Nota do TMDB</option>
          <option value="az">A–Z</option>
        </select>
      </Row>

      <div className="set-footer">
        {/* Restaura SÓ a aparência e a ordem da Biblioteca (uma chave: mycatalog.preferences.v1).
            Streaming, privacidade e notificações ficam intactos. */}
        <button
          type="button"
          className="btn"
          onClick={() => {
            setPreferences(DEFAULT_PREFERENCES);
            savePreferences(DEFAULT_PREFERENCES);
          }}
        >
          <RotateCcw size={15} aria-hidden="true" />
          Restaurar aparência padrão
        </button>
      </div>
    </section>
  );
}

type RatingCategory = { id: string; name: string; weight: number; position?: number };

/*
 * V3.3 — esta seção editava `rating_categories`, que NENHUMA tela usa (0
 * linhas em PROD): criar um critério aqui não mudava nada. Os critérios reais
 * são os do modo "Detalhada" em Avaliações e resenhas, na página de título (ReviewPanel →
 * /api/reviews/categories → review_categories/review_scores): é a mesma
 * lista, editável nos dois lugares. Nota final = média ponderada das
 * categorias preenchidas; pesos relativos (0–100); todos 0 = média simples.
 */
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');

function RatingsSection() {
  const [items, setItems] = useState<RatingCategory[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setStatus('loading');

    try {
      const response = await fetch('/api/reviews/categories', { cache: 'no-store' });

      if (!response.ok) throw new Error();

      const data = await response.json();

      setItems(Array.isArray(data) ? data : []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    const value = name.trim();

    if (!value) return;

    if (items.some((item) => sameName(item.name, value))) {
      setError('Já existe uma categoria com esse nome.');
      return;
    }

    setError('');

    try {
      const response = await fetch('/api/reviews/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Primeira categoria nasce com peso 100 (mesma regra do painel de avaliação).
        body: JSON.stringify({ name: value, weight: items.length === 0 ? 100 : 0, position: items.length }),
      });

      if (!response.ok) throw new Error();

      const created = (await response.json()) as RatingCategory;
      setItems((list) => [...list, created]);
      setName('');
    } catch {
      setError('Não foi possível adicionar a categoria.');
    }
  }

  // Salva ao sair do campo; falha volta o valor anterior (a tela nunca finge que salvou).
  async function patch(id: string, key: 'name' | 'weight', value: string | number) {
    const current = items.find((item) => item.id === id);

    if (!current || current[key] === value) return;

    if (key === 'name' && items.some((item) => item.id !== id && sameName(item.name, String(value)))) {
      setError('Já existe uma categoria com esse nome.');
      return;
    }

    setError('');
    setItems((list) => list.map((item) => (item.id === id ? { ...item, [key]: value } : item)));

    const response = await fetch('/api/reviews/categories', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, [key]: value }),
    }).catch(() => null);

    if (!response?.ok) {
      setItems((list) => list.map((item) => (item.id === id ? current : item)));
      setError('Não foi possível salvar a alteração. O valor anterior foi mantido.');
    }
  }

  async function remove(id: string) {
    const response = await fetch(`/api/reviews/categories?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(
      () => null
    );

    if (response?.ok) setItems((list) => list.filter((item) => item.id !== id));
    else setError('Não foi possível excluir a categoria.');
  }

  const totalWeight = items.reduce((sum, item) => sum + Number(item.weight || 0), 0);

  return (
    <section className="set-card" aria-labelledby="set-ratings">
      <SectionHead
        id="set-ratings"
        title="Critérios de avaliação"
        description="Categorias opcionais (ex.: roteiro, atuação) para avaliar no modo Detalhada, em Avaliações e resenhas de cada título. A nota sugerida é a média ponderada das categorias que você preencher."
      />

      {status === 'loading' && <p className="set-empty" role="status">Carregando categorias…</p>}
      {status === 'error' && (
        <div className="set-inline-error" role="alert">
          <span>Não foi possível carregar suas categorias.</span>
          <button type="button" className="btn" onClick={() => void load()}>
            Tentar de novo
          </button>
        </div>
      )}
      {status === 'ready' && items.length === 0 && (
        <p className="set-empty">Nenhuma categoria. Sem categorias, você avalia só com a nota geral — e está tudo bem.</p>
      )}

      {items.map((item) => (
        <div className="set-row" key={item.id}>
          <input
            className="set-input"
            defaultValue={item.name}
            maxLength={80}
            aria-label="Nome da categoria"
            onBlur={(event) => patch(item.id, 'name', event.target.value.trim() || item.name)}
          />
          <label className="set-weight">
            <span>Peso</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              defaultValue={item.weight}
              aria-label={`Peso de ${item.name || 'categoria'}`}
              onBlur={(event) => {
                const weight = Math.round(Math.max(0, Math.min(100, Number(event.target.value) || 0)));

                event.target.value = String(weight);
                void patch(item.id, 'weight', weight);
              }}
            />
          </label>
          <button type="button" className="set-icon-btn" aria-label={`Excluir ${item.name}`} onClick={() => remove(item.id)}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      ))}

      {status === 'ready' && items.length > 0 && (
        <p className="set-hint">
          {totalWeight > 0
            ? 'Os pesos são relativos: não precisam somar 100.'
            : 'Todos os pesos estão em 0: a nota sugerida será a média simples.'}
        </p>
      )}

      {status === 'ready' && (
        <div className="set-add">
          <input
            className="set-input"
            placeholder="Nova categoria (ex.: Roteiro)"
            aria-label="Nome da nova categoria"
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && add()}
          />
          <button type="button" className="btn primary" onClick={add} disabled={!name.trim()}>
            <Plus size={15} aria-hidden="true" />
            Adicionar
          </button>
        </div>
      )}
      {error && <p className="set-error" role="alert">{error}</p>}
    </section>
  );
}

function SettingsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = tabFromQuery(searchParams.get('tab'));

  function select(tab: TabId) {
    if (tab === active) return;

    router.push(`${pathname}?tab=${tab}`, { scroll: false });
  }

  return (
    <>
      <Search />

      <div className="set-page">
        <h1 className="set-title">Configurações</h1>

        <div className="set-layout">
          <nav className="set-nav" aria-label="Seções das configurações">
            {TABS.map((tab) => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`set-nav-item${active === tab.id ? ' is-active' : ''}`}
                  aria-current={active === tab.id ? 'page' : undefined}
                  onClick={() => select(tab.id)}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className="set-nav-text">
                    <strong>{tab.label}</strong>
                    <small>{tab.hint}</small>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="set-content">
            {active === 'appearance' && <AppearanceSection />}
            {active === 'streaming' && (
              <>
                <StreamingServicesSettings />
                {/* V3.3: preferência de recomendação — saiu de "Conta e privacidade". */}
                <HiddenTitlesSettings />
              </>
            )}
            {active === 'notifications' && <NotificationSettings />}
            {active === 'account' && (
              <>
                <AccountPrivacy />
                <SocialSettings />
              </>
            )}
            {active === 'ratings' && <RatingsSection />}
            {active === 'data' && <DataBackup />}
          </div>
        </div>
      </div>
    </>
  );
}

export default function Settings() {
  return (
    <Suspense fallback={null}>
      <SettingsContent />
    </Suspense>
  );
}
