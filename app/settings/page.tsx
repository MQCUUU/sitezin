'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search } from '@/components/Search';
import { createClient } from '@/lib/supabase/client';
import { DataBackup } from '@/components/DataBackup';
import { AccountPrivacy } from '@/components/AccountPrivacy';
import { SocialSettings } from '@/components/SocialSettings';
import { NotificationSettings } from '@/components/NotificationSettings';

import {
  ACCENT_OPTIONS,
  DEFAULT_PREFERENCES,
  type AppearancePreferences,
  readPreferences,
  savePreferences,
} from '@/lib/preferences';

import {
  Check,
  Moon,
  Palette,
  RotateCcw,
  Sparkles,
  Sun,
  MonitorCog,
  Circle,
  Rows3,
  ArrowDownUp,
} from 'lucide-react';

export default function Settings() {
  const searchParams = useSearchParams();
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'account' | 'notifications' | 'appearance'>('general');
  const [d, setD] = useState<any[]>([]);
  const [name, setName] = useState('');
  useEffect(() => { const tab = searchParams.get('tab'); if (['general','account','notifications','appearance'].includes(tab || '')) setActiveSettingsTab(tab as typeof activeSettingsTab); }, [searchParams]);

  const [preferences, setPreferences] =
    useState<AppearancePreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    const s = createClient();

    s.from('rating_categories')
      .select('*')
      .order('position')
      .then(({ data }: { data: any[] | null }) => {
        setD(data || []);
      });

    setPreferences(readPreferences());
  }, []);

  const add = async () => {
    if (!name.trim()) return;

    const s = createClient();

    const { data } = await s
      .from('rating_categories')
      .insert({
        name,
        weight: 0,
        position: d.length,
      })
      .select()
      .single();

    if (data) {
      setD([...d, data]);
    }

    setName('');
  };

  const update = async (
    id: string,
    k: string,
    v: any
  ) => {
    const s = createClient();

    await s
      .from('rating_categories')
      .update({
        [k]: v,
      })
      .eq('id', id);

    setD(
      d.map((x) =>
        x.id === id
          ? {
              ...x,
              [k]: v,
            }
          : x
      )
    );
  };

  const remove = async (id: string) => {
    const s = createClient();

    await s
      .from('rating_categories')
      .delete()
      .eq('id', id);

    setD(d.filter((x) => x.id !== id));
  };

  const changePreference = <
    K extends keyof AppearancePreferences
  >(
    key: K,
    value: AppearancePreferences[K]
  ) => {
    const next = {
      ...preferences,
      [key]: value,
    };

    setPreferences(next);
    savePreferences(next);
  };

  const resetAppearance = () => {
    setPreferences(DEFAULT_PREFERENCES);
    savePreferences(DEFAULT_PREFERENCES);
  };

  return (
    <>
      <Search />

      <div className="section">
        <div className="eyebrow">Do seu jeito</div>

        <h1>Configurações</h1>

        <p className="muted">
          Personalize a aparência do MyCatalog e ajuste
          seus critérios de avaliação.
        </p>
      </div>

      <div className="settings-layout">

        <nav className="settings-tabs" aria-label="Seções das configurações">
          {[['general','Geral'],['account','Conta e privacidade'],['notifications','Notificações'],['appearance','Aparência']] .map(([value,label]) => <button key={value} className={activeSettingsTab === value ? 'active' : ''} onClick={() => setActiveSettingsTab(value as typeof activeSettingsTab)}>{label}</button>)}
        </nav>

        {activeSettingsTab === 'general' && <section className="panel settings-profile-moved"><div><span className="eyebrow">PERFIL</span><h2>Edite diretamente na sua página</h2><p className="muted">Avatar, biografia, @, visibilidade e Top 5 agora ficam juntos no seu perfil.</p></div><a className="btn primary" href="/profile">Abrir meu perfil</a></section>}

        {activeSettingsTab === 'appearance' && <>

        {/* ========================= */}
        {/* PERSONALIZAÇÃO */}
        {/* ========================= */}

        <section className="panel settings-panel settings-appearance">

          <div className="settings-panel-head">

            <div className="settings-icon">
              <Palette size={19} />
            </div>

            <div>
              <h2>Personalização</h2>

              <p className="muted">
                Temas, aparência e preferências da interface.
              </p>
            </div>

            <button
              className="btn ghost settings-reset"
              onClick={resetAppearance}
            >
              <RotateCcw size={15} />

              Restaurar padrão
            </button>

          </div>

          {/* TEMA */}

          <div className="settings-group">

            <div className="settings-group-title">

              <MonitorCog size={17} />

              <div>
                <b>Tema</b>

                <span>
                  Escolha a base visual do catálogo.
                </span>
              </div>

            </div>

            <div className="theme-options">

              {/* ESCURO */}

              <button
                className={`theme-card ${
                  preferences.theme === 'dark'
                    ? 'active'
                    : ''
                }`}
                onClick={() =>
                  changePreference('theme', 'dark')
                }
              >

                <div className="theme-preview preview-dark">
                  <span />
                  <span />
                  <span />
                </div>

                <div>
                  <Moon size={15} />

                  <b>Escuro</b>

                  <small>
                    Visual original
                  </small>
                </div>

                {preferences.theme === 'dark' && (
                  <Check
                    className="theme-check"
                    size={16}
                  />
                )}

              </button>

              {/* AMOLED */}

              <button
                className={`theme-card ${
                  preferences.theme === 'oled'
                    ? 'active'
                    : ''
                }`}
                onClick={() =>
                  changePreference('theme', 'oled')
                }
              >

                <div className="theme-preview preview-oled">
                  <span />
                  <span />
                  <span />
                </div>

                <div>
                  <Sparkles size={15} />

                  <b>AMOLED</b>

                  <small>
                    Preto profundo
                  </small>
                </div>

                {preferences.theme === 'oled' && (
                  <Check
                    className="theme-check"
                    size={16}
                  />
                )}

              </button>

              {/* CLARO */}

              <button
                className={`theme-card ${
                  preferences.theme === 'light'
                    ? 'active'
                    : ''
                }`}
                onClick={() =>
                  changePreference('theme', 'light')
                }
              >

                <div className="theme-preview preview-light">
                  <span />
                  <span />
                  <span />
                </div>

                <div>
                  <Sun size={15} />

                  <b>Claro</b>

                  <small>
                    Mais luminoso
                  </small>
                </div>

                {preferences.theme === 'light' && (
                  <Check
                    className="theme-check"
                    size={16}
                  />
                )}

              </button>

            </div>

          </div>

          {/* COR DE DESTAQUE */}

          <div className="settings-group">

            <div className="settings-group-title">

              <Palette size={17} />

              <div>
                <b>Cor de destaque</b>

                <span>
                  Usada em botões, seleções e elementos
                  principais da interface.
                </span>
              </div>

            </div>

            <div className="accent-options">

              {ACCENT_OPTIONS.map((accent) => (
                <button
                  key={accent.value}
                  title={accent.name}
                  aria-label={`Usar cor ${accent.name}`}
                  className={`accent-swatch ${
                    preferences.accent === accent.value
                      ? 'active'
                      : ''
                  }`}
                  style={{
                    background: accent.value,
                  }}
                  onClick={() =>
                    changePreference(
                      'accent',
                      accent.value
                    )
                  }
                >
                  {preferences.accent ===
                    accent.value && (
                    <Check size={17} />
                  )}
                </button>
              ))}

            </div>

          </div>

          {/* PREFERÊNCIAS EXTRAS */}

          <div className="settings-preference-grid">

            {/* DENSIDADE */}

            <div className="settings-group compact-group">

              <div className="settings-group-title">

                <Rows3 size={17} />

                <div>
                  <b>Densidade</b>

                  <span>
                    Controle o espaço entre elementos.
                  </span>
                </div>

              </div>

              <div className="segmented-control">

                <button
                  className={
                    preferences.density ===
                    'comfortable'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    changePreference(
                      'density',
                      'comfortable'
                    )
                  }
                >
                  Confortável
                </button>

                <button
                  className={
                    preferences.density ===
                    'compact'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    changePreference(
                      'density',
                      'compact'
                    )
                  }
                >
                  Compacta
                </button>

              </div>

            </div>

            {/* CANTOS */}

            <div className="settings-group compact-group">

              <div className="settings-group-title">

                <Circle size={17} />

                <div>
                  <b>Cantos</b>

                  <span>
                    Formato de cards e painéis.
                  </span>
                </div>

              </div>

              <div className="segmented-control three">

                <button
                  className={
                    preferences.radius ===
                    'rounded'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    changePreference(
                      'radius',
                      'rounded'
                    )
                  }
                >
                  Redondos
                </button>

                <button
                  className={
                    preferences.radius ===
                    'soft'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    changePreference(
                      'radius',
                      'soft'
                    )
                  }
                >
                  Suaves
                </button>

                <button
                  className={
                    preferences.radius ===
                    'square'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    changePreference(
                      'radius',
                      'square'
                    )
                  }
                >
                  Retos
                </button>

              </div>

            </div>

            {/* ANIMAÇÕES */}

            <div className="settings-group compact-group">

              <div className="settings-group-title">

                <Sparkles size={17} />

                <div>
                  <b>Animações</b>

                  <span>
                    Controle transições e movimentos.
                  </span>
                </div>

              </div>

              <div className="segmented-control">

                <button
                  className={
                    preferences.motion ===
                    'full'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    changePreference(
                      'motion',
                      'full'
                    )
                  }
                >
                  Ativadas
                </button>

                <button
                  className={
                    preferences.motion ===
                    'reduced'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    changePreference(
                      'motion',
                      'reduced'
                    )
                  }
                >
                  Reduzidas
                </button>

              </div>

            </div>

            {/* ORDEM DA BIBLIOTECA */}

            <div className="settings-group compact-group">

              <div className="settings-group-title">

                <ArrowDownUp size={17} />

                <div>
                  <b>Ordem da biblioteca</b>

                  <span>
                    Escolha como sua coleção deve abrir.
                  </span>
                </div>

              </div>

              <select
                className="settings-select"
                value={preferences.defaultSort}
                onChange={(event) =>
                  changePreference(
                    'defaultSort',
                    event.target
                      .value as AppearancePreferences['defaultSort']
                  )
                }
              >

                <option value="added">
                  Adicionados recentemente
                </option>

                <option value="updated">
                  Atualizados recentemente
                </option>

                <option value="rating">
                  Minha nota
                </option>

                <option value="tmdb">
                  Nota TMDB
                </option>

                <option value="az">
                  A–Z
                </option>

              </select>

            </div>

          </div>

        </section>

        {/* ========================= */}
        {/* CATEGORIAS DE AVALIAÇÃO */}
        {/* ========================= */}

        <section className="panel settings-panel">

          <div className="settings-panel-head">

            <div>
              <h2>
                Categorias de avaliação
              </h2>

              <p className="muted">
                Crie critérios próprios. Os pesos podem
                ser usados para calcular sua nota final.
              </p>
            </div>

          </div>

          <div className="rating-settings-list">

            {d.length === 0 && (
              <div
                className="muted"
                style={{
                  padding: '20px 0',
                }}
              >
                Nenhuma categoria criada ainda.
              </div>
            )}

            {d.map((x) => (

              <div
                className="row"
                key={x.id}
              >

                <input
                  value={x.name}
                  onChange={(e) =>
                    update(
                      x.id,
                      'name',
                      e.target.value
                    )
                  }
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: 'var(--text)',
                    flex: 1,
                  }}
                />

                <input
                  type="number"
                  min="0"
                  max="100"
                  value={x.weight}
                  onChange={(e) =>
                    update(
                      x.id,
                      'weight',
                      Number(e.target.value)
                    )
                  }
                  style={{
                    width: 80,
                  }}
                />

                <button
                  className="btn"
                  onClick={() =>
                    remove(x.id)
                  }
                >
                  Excluir
                </button>

              </div>

            ))}

          </div>

          <div className="actions">

            <input
              placeholder="Nova categoria"
              value={name}
              onChange={(e) =>
                setName(e.target.value)
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  add();
                }
              }}
            />

            <button
              className="btn primary"
              onClick={add}
            >
              Adicionar
            </button>

          </div>

        </section>

        </>}

        {/* ========================= */}
        {/* CONTA / PRIVACIDADE */}
        {/* ========================= */}

        {activeSettingsTab === 'account' && <><AccountPrivacy /><SocialSettings /><DataBackup /></>}

        {activeSettingsTab === 'notifications' && <NotificationSettings />}

        {/* ========================= */}
        {/* SEUS DADOS / BACKUP */}
        {/* ========================= */}

      </div>
    </>
  );
}
