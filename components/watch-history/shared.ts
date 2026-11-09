export type WatchEntry = {
  id:
    string;

  library_item_id:
    string;

  media_id:
    string;

  watched_at:
    string;

  rating:
    number |
    null;

  comment:
    string |
    null;

  is_rewatch:
    boolean;

  created_at:
    string;

  updated_at:
    string;
};

export function toLocalInput(
  iso:
    string
) {
  const date =
    new Date(
      iso
    );

  const offset =
    date.getTimezoneOffset();

  const local =
    new Date(
      date.getTime() -
      offset *
        60 *
        1000
    );

  return local
    .toISOString()
    .slice(
      0,
      16
    );
}

export function nowLocalInput() {
  return toLocalInput(
    new Date()
      .toISOString()
  );
}

export function formatDate(
  value:
    string
) {
  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      day:
        "2-digit",

      month:
        "short",

      year:
        "numeric",

      hour:
        "2-digit",

      minute:
        "2-digit",
    }
  ).format(
    new Date(
      value
    )
  );
}

export function sameDayKey(
  value:
    string
) {
  const date =
    new Date(
      value
    );

  return [
    date.getFullYear(),

    String(
      date.getMonth() +
        1
    ).padStart(
      2,
      "0"
    ),

    String(
      date.getDate()
    ).padStart(
      2,
      "0"
    ),
  ].join(
    "-"
  );
}
