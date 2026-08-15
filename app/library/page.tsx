"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { Search } from "@/components/Search";
import {
  PosterGrid,
} from "@/components/PosterGrid";

import type {
  LibraryItem,
  Status,
} from "@/lib/types";

import {
  STATUS_LABELS,
} from "@/lib/types";

import {
  SlidersHorizontal,
} from "lucide-react";

export default function Library() {
  const [
    data,
    setData,
  ] = useState<LibraryItem[]>([]);

  const [
    type,
    setType,
  ] = useState("all");

  const [
    status,
    setStatus,
  ] = useState("all");

  const [
    sort,
    setSort,
  ] = useState("added");

  async function loadLibrary() {
    try {
      const response =
        await fetch(
          "/api/library"
        );

      if (!response.ok) {
        setData([]);
        return;
      }

      const result =
        await response.json();

      setData(
        Array.isArray(result)
          ? result.map(
              (item: any) => ({
                ...item,
                library_id:
                  item.id,
                ...item.media,
              })
            )
          : []
      );
    } catch (error) {
      console.error(error);
      setData([]);
    }
  }

  useEffect(() => {
    loadLibrary();
  }, []);

  const filtered =
    useMemo(() => {
      const filteredData =
        data.filter(
          (item) =>
            (type === "all" ||
              item.media_type ===
                type) &&
            (status === "all" ||
              item.status ===
                status)
        );

      return [...filteredData].sort(
        (a, b) => {
          if (
            sort === "rating"
          ) {
            return (
              (b.personal_rating ??
                -1) -
              (a.personal_rating ??
                -1)
            );
          }

          if (
            sort === "az"
          ) {
            return a.title.localeCompare(
              b.title
            );
          }

          if (
            sort === "old"
          ) {
            return (
              new Date(
                a.release_date ||
                  a.first_air_date ||
                  "9999"
              ).getTime() -
              new Date(
                b.release_date ||
                  b.first_air_date ||
                  "9999"
              ).getTime()
            );
          }

          return (
            new Date(
              b.added_at
            ).getTime() -
            new Date(
              a.added_at
            ).getTime()
          );
        }
      );
    }, [
      data,
      type,
      status,
      sort,
    ]);

  return (
    <>
      <div className="topbar">
        <Search />
      </div>

      <div className="library-head">
        <div>
          <div className="eyebrow">
            Minha coleção
          </div>

          <h1
            style={{
              margin:
                "5px 0",
            }}
          >
            Biblioteca
          </h1>

          <div className="muted">
            {filtered.length} títulos
          </div>
        </div>

        <button className="btn">
          <SlidersHorizontal
            size={16}
          />

          Filtros
        </button>
      </div>

      <div className="filters">
        {[
          ["all", "Todos"],
          ["movie", "Filmes"],
          ["tv", "Séries"],
        ].map(
          ([value, label]) => (
            <button
              key={value}
              className={
                "chip " +
                (type === value
                  ? "active"
                  : "")
              }
              onClick={() =>
                setType(value)
              }
            >
              {label}
            </button>
          )
        )}

        {[
          "all",
          ...Object.keys(
            STATUS_LABELS
          ),
        ].map((value) => (
          <button
            key={value}
            className={
              "chip " +
              (status === value
                ? "active"
                : "")
            }
            onClick={() =>
              setStatus(value)
            }
          >
            {value === "all"
              ? "Todos"
              : STATUS_LABELS[
                  value as Status
                ]}
          </button>
        ))}

        <select
          className="chip"
          value={sort}
          onChange={(event) =>
            setSort(
              event.target.value
            )
          }
        >
          <option value="added">
            Mais recentes
          </option>

          <option value="rating">
            Maior nota
          </option>

          <option value="az">
            A-Z
          </option>

          <option value="old">
            Mais antigos
          </option>
        </select>
      </div>

      <PosterGrid
        items={filtered}
        onChanged={
          loadLibrary
        }
      />
    </>
  );
}