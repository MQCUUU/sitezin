export const WATCH_NOW_URL = "/api/resolve-link?title={title}&year={year}&type={type}&id={id}&slug={slug}";

export function watchSlug(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function watchNowHref({
  type,
  id,
  title,
  year,
}: {
  type: string;
  id: number | string;
  title: string;
  year: string;
}): string {
  return WATCH_NOW_URL.replace("{type}", encodeURIComponent(type))
    .replace("{id}", encodeURIComponent(String(id)))
    .replace("{title}", encodeURIComponent(title))
    .replace("{slug}", watchSlug(title))
    .replace("{year}", encodeURIComponent(year));
}