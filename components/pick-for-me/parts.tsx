"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useModal } from "@/hooks/useModal";
import { ChevronDown, X } from "lucide-react";
import { img } from "@/lib/tmdb";
import { normalizeWatchProviders } from "@/components/media/providers/normalize";
import { ProviderLogo } from "@/components/media/providers/ProviderLogo";
import { WATCH_PROVIDER_KIND_LABELS } from "@/components/media/providers/types";
import type { WatchProviderItem } from "@/components/media/providers/types";
import { type PickResult } from "@/components/pick-for-me/shared";

export type MultiPickerOption = {
  value:
    string;

  label:
    string;

  logo?:
    string |
    null;

  badge?:
    string;
};

export function MultiPicker({
  options,
  selected,
  onChange,
  placeholder,
  searchPlaceholder,
  disabled,
}: {
  options:
    MultiPickerOption[];

  selected:
    string[];

  onChange:
    (
      values:
        string[]
    ) =>
      void;

  placeholder:
    string;

  searchPlaceholder:
    string;

  disabled?:
    boolean;
}) {
  const [
    open,
    setOpen,
  ] =
    useState(false);

  useModal(
    open,
    () =>
      setOpen(
        false
      ),
    false
  );

  const [
    search,
    setSearch,
  ] =
    useState("");

  const ref =
    useRef<HTMLDivElement>(
      null
    );

  useEffect(() => {
    if (
      !open
    ) {
      return;
    }

    function outside(
      event:
        MouseEvent
    ) {
      if (
        ref.current &&
        !ref.current.contains(
          event.target as Node
        )
      ) {
        setOpen(
          false
        );
      }
    }

    document.addEventListener(
      "mousedown",
      outside
    );

    return () =>
      document.removeEventListener(
        "mousedown",
        outside
      );
  }, [
    open,
  ]);

  const visible =
    useMemo(
      () => {
        const q =
          search
            .trim()
            .toLocaleLowerCase(
              "pt-BR"
            );

        if (!q) {
          return options;
        }

        return options.filter(
          (
            option
          ) =>
            option.label
              .toLocaleLowerCase(
                "pt-BR"
              )
              .includes(
                q
              )
        );
      },
      [
        options,
        search,
      ]
    );

  const selectedOptions =
    options.filter(
      (
        option
      ) =>
        selected.includes(
          option.value
        )
    );

  function toggle(
    value:
      string
  ) {
    onChange(
      selected.includes(
        value
      )
        ? selected.filter(
            (
              current
            ) =>
              current !==
              value
          )
        : [
            ...selected,
            value,
          ]
    );
  }

  return (
    <div
      className={
        "pick-multi " +
        (open
          ? "open"
          : "")
      }
      ref={
        ref
      }
    >
      <button
        type="button"
        className="pick-multi-trigger"
        disabled={
          disabled
        }
        onClick={() =>
          setOpen(
            (
              value
            ) =>
              !value
          )
        }
      >
        <span>
          {selectedOptions.length ===
          0
            ? placeholder
            : selectedOptions.length ===
                1
              ? selectedOptions[
                  0
                ].label
              : `${selectedOptions.length} selecionados`}
        </span>

        <ChevronDown
          size={14}
        />
      </button>

      {selectedOptions.length >
        0 && (
        <div className="pick-multi-chips">
          {selectedOptions
            .slice(
              0,
              4
            )
            .map(
              (
                option
              ) => (
                <button
                  type="button"
                  key={
                    option.value
                  }
                  title={`Remover ${option.label}`}
                  onClick={() =>
                    toggle(
                      option.value
                    )
                  }
                >
                  {
                    option.label
                  }
                  <X
                    size={12}
                  />
                </button>
              )
            )}

          {selectedOptions.length >
            4 && (
            <span>
              +{
                selectedOptions.length -
                4
              }
            </span>
          )}
        </div>
      )}

      {open && (
        <div className="pick-multi-popover">
          <div className="pick-multi-search">
            <input
              value={
                search
              }
              autoFocus
              placeholder={
                searchPlaceholder
              }
              onChange={(
                event
              ) =>
                setSearch(
                  event.target
                    .value
                )
              }
            />

            {selected.length >
              0 && (
              <button
                type="button"
                onClick={() =>
                  onChange(
                    []
                  )
                }
              >
                Limpar
              </button>
            )}
          </div>

          <div className="pick-multi-options">
            {visible.map(
              (
                option
              ) => {
                const active =
                  selected.includes(
                    option.value
                  );

                return (
                  <button
                    type="button"
                    key={
                      option.value
                    }
                    className={
                      active
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      toggle(
                        option.value
                      )
                    }
                  >
                    {option.logo ? (
                      <img loading="lazy" decoding="async"
                        src={img(
                          option.logo,
                          "w92"
                        )}
                        alt=""
                      />
                    ) : (
                      <span className="pick-multi-check">
                        {active
                          ? "✓"
                          : ""}
                      </span>
                    )}

                    <strong>
                      {
                        option.label
                      }
                    </strong>

                    {option.badge && (
                      <small>
                        {
                          option.badge
                        }
                      </small>
                    )}
                  </button>
                );
              }
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/*
 * Region note (C3.2B): the "País" filter elsewhere in this component
 * (`country` state) is TMDB's `with_origin_country` — it narrows which
 * titles are eligible for the pick by production country, and is sent to
 * `/api/pick-for-me` for that purpose only. It has never had any
 * connection to which watch-provider region gets displayed here — this
 * box always read `results.BR`, independent of that filter, both before
 * and after this migration. Preserved exactly; not something this phase
 * changes (see C3.2B report — PRE-EXISTING REGION UX DEBT).
 */
export function PickForMeWatchProviders({
  winner,
}: {
  winner:
    PickResult |
    null;
}) {
  const data = normalizeWatchProviders(winner?.watch_providers, "BR");

  if (data.groups.length === 0) {
    return null;
  }

  return (
    <div className="pick-watch">
      <strong>
        Onde assistir no Brasil
      </strong>

      {data.groups.map((group) => (
        <ProviderLine
          key={group.kind}
          label={WATCH_PROVIDER_KIND_LABELS[group.kind]}
          providers={group.providers}
        />
      ))}
    </div>
  );
}

export function ProviderLine({
  label,
  providers,
}: {
  label: string;
  providers: WatchProviderItem[];
}) {
  return (
    <div className="pick-provider-line">
      <span>
        {
          label
        }
      </span>

      <div>
        {providers.map((provider) => (
          <ProviderLogo key={provider.id} provider={provider} sizes="27px" className="pick-provider-logo" />
        ))}
      </div>
    </div>
  );
}
