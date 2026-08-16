import {
  expect,
  test,
} from "@playwright/test";

import {
  jsonRequest,
} from "./helpers";

/*
 * Usamos um título fixo e estável do TMDB.
 *
 * 157336 = Interestelar.
 *
 * Se ele já estiver na biblioteca da conta E2E,
 * o teste limpa o estado primeiro.
 */
const TEST_MEDIA = {
  id:
    157336,

  media_type:
    "movie" as const,

  title:
    "Interestelar",

  original_title:
    "Interstellar",

  poster_path:
    null,

  backdrop_path:
    null,

  release_date:
    "2014-11-05",

  genres:
    [],
};

type LibraryItem = {
  id:
    string;

  status?:
    string;

  favorite?:
    boolean;

  personal_rating?:
    number |
    null;

  media?:
    {
      tmdb_id?:
        number;

      media_type?:
        string;
    };

  tmdb_id?:
    number;

  media_type?:
    string;
};

async function getLibrary(
  request:
    Parameters<
      typeof jsonRequest
    >[0]
) {
  const result =
    await jsonRequest<any>(
      request,
      "GET",
      "/api/library"
    );

  /*
   * Sua API já teve versões retornando array
   * diretamente e versões paginadas.
   * O teste aceita as duas.
   */
  if (
    Array.isArray(
      result
    )
  ) {
    return result as
      LibraryItem[];
  }

  if (
    Array.isArray(
      result?.results
    )
  ) {
    return result.results as
      LibraryItem[];
  }

  if (
    Array.isArray(
      result?.items
    )
  ) {
    return result.items as
      LibraryItem[];
  }

  return [];
}

function isTestMedia(
  item:
    LibraryItem
) {
  const tmdbId =
    item.media?.tmdb_id ??
    item.tmdb_id;

  const type =
    item.media?.media_type ??
    item.media_type;

  return (
    Number(
      tmdbId
    ) ===
      TEST_MEDIA.id &&
    type ===
      TEST_MEDIA.media_type
  );
}

test.describe(
  "fluxo crítico do catálogo",
  () => {
    test.describe.configure({
      mode:
        "serial",
    });

    let libraryId =
      "";

    test.beforeAll(
      async ({
        request,
      }) => {
        /*
         * Garante estado previsível.
         */
        const library =
          await getLibrary(
            request
          );

        const existing =
          library.find(
            isTestMedia
          );

        if (
          existing?.id
        ) {
          const response =
            await request.delete(
              `/api/library/${existing.id}`
            );

          expect(
            [
              200,
              204,
            ]
          ).toContain(
            response.status()
          );
        }

        /*
         * Remove "não tenho interesse" anterior,
         * se existir. 404 é aceitável.
         */
        const params =
          new URLSearchParams({
            tmdb_id:
              String(
                TEST_MEDIA.id
              ),

            media_type:
              TEST_MEDIA.media_type,
          });

        const response =
          await request.delete(
            `/api/not-interested?${params.toString()}`
          );

        expect(
          [
            200,
            204,
            404,
          ]
        ).toContain(
          response.status()
        );
      }
    );

    test(
      "1. página privada abre autenticada",
      async ({
        page,
      }) => {
        await page.goto(
          "/library"
        );

        await expect(
          page
        ).toHaveURL(
          /\/library/
        );

        await expect(
          page.getByText(
            "Não autenticado"
          )
        ).toHaveCount(
          0
        );
      }
    );

    test(
      "2. adiciona título à biblioteca",
      async ({
        request,
      }) => {
        const result =
          await jsonRequest<any>(
            request,
            "POST",
            "/api/library",
            {
              media: {
                ...TEST_MEDIA,
              },

              status:
                "want",

              favorite:
                false,
            }
          );

        libraryId =
          String(
            result.id ||
            result.library_id ||
            ""
          );

        expect(
          libraryId
        ).not.toBe(
          ""
        );

        const library =
          await getLibrary(
            request
          );

        expect(
          library.some(
            isTestMedia
          )
        ).toBeTruthy();
      }
    );

    test(
      "3. muda status",
      async ({
        request,
      }) => {
        expect(
          libraryId
        ).not.toBe(
          ""
        );

        const result =
          await jsonRequest<any>(
            request,
            "PATCH",
            `/api/library/${libraryId}`,
            {
              status:
                "watching",
            }
          );

        expect(
          result.status
        ).toBe(
          "watching"
        );
      }
    );

    test(
      "4. salva nota pessoal",
      async ({
        request,
      }) => {
        const result =
          await jsonRequest<any>(
            request,
            "PATCH",
            `/api/library/${libraryId}`,
            {
              personal_rating:
                9.5,
            }
          );

        expect(
          Number(
            result.personal_rating
          )
        ).toBe(
          9.5
        );
      }
    );

    test(
      "5. remove e restaura o título",
      async ({
        request,
      }) => {
        const remove =
          await request.delete(
            `/api/library/${libraryId}`
          );

        expect(
          [
            200,
            204,
          ]
        ).toContain(
          remove.status()
        );

        let library =
          await getLibrary(
            request
          );

        expect(
          library.some(
            isTestMedia
          )
        ).toBeFalsy();

        /*
         * "Desfazer" no produto equivale a restaurar
         * o registro logo após a remoção. Testamos
         * a persistência real do backend, não apenas
         * o toast visual.
         */
        const restored =
          await jsonRequest<any>(
            request,
            "POST",
            "/api/library",
            {
              media: {
                ...TEST_MEDIA,
              },

              status:
                "watching",

              favorite:
                false,
            }
          );

        libraryId =
          String(
            restored.id ||
            restored.library_id ||
            ""
          );

        expect(
          libraryId
        ).not.toBe(
          ""
        );

        library =
          await getLibrary(
            request
          );

        expect(
          library.some(
            isTestMedia
          )
        ).toBeTruthy();
      }
    );

    test(
      "6. marca não tenho interesse e desfaz",
      async ({
        request,
      }) => {
        const create =
          await request.post(
            "/api/not-interested",
            {
              data: {
                tmdb_id:
                  TEST_MEDIA.id,

                media_type:
                  TEST_MEDIA.media_type,
              },
            }
          );

        expect(
          create.ok(),
          await create.text()
        ).toBeTruthy();

        const params =
          new URLSearchParams({
            tmdb_id:
              String(
                TEST_MEDIA.id
              ),

            media_type:
              TEST_MEDIA.media_type,
          });

        const undo =
          await request.delete(
            `/api/not-interested?${params.toString()}`
          );

        expect(
          [
            200,
            204,
          ]
        ).toContain(
          undo.status()
        );
      }
    );

    test(
      "7. exporta backup JSON válido",
      async ({
        request,
      }) => {
        const response =
          await request.get(
            "/api/account/export?format=json"
          );

        expect(
          response.ok(),
          await response.text()
        ).toBeTruthy();

        expect(
          response.headers()[
            "content-type"
          ]
        ).toContain(
          "application/json"
        );

        const backup =
          await response.json();

        expect(
          backup.mycatalog_backup
        ).toBe(
          true
        );

        expect(
          Number(
            backup.version
          )
        ).toBeGreaterThanOrEqual(
          1
        );

        expect(
          Array.isArray(
            backup.data
              ?.library
          )
        ).toBeTruthy();
      }
    );

    test.afterAll(
      async ({
        request,
      }) => {
        /*
         * Limpa o título usado pelo teste para a
         * conta E2E continuar previsível.
         */
        if (
          libraryId
        ) {
          await request.delete(
            `/api/library/${libraryId}`
          );
        }

        const params =
          new URLSearchParams({
            tmdb_id:
              String(
                TEST_MEDIA.id
              ),

            media_type:
              TEST_MEDIA.media_type,
          });

        await request.delete(
          `/api/not-interested?${params.toString()}`
        );
      }
    );
  }
);