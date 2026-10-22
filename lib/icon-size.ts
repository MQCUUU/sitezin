/**
 * Escala de ícones (lucide-react) — Fase 3.
 *
 *   xxs 12  junto de texto de 12–13px (badges, metadado, estrela da nota)
 *   xs  14  chips, botões compactos
 *   sm  16  botões e campos (o padrão)
 *   md  18  ações de destaque (hero do título, CTA)
 *   lg  22  cabeçalhos de seção, estados vazios pequenos
 *
 * Exceções aceitas: 20px em ícones de bloco (cartões de recurso, ícone de
 * diálogo de confirmação, resultado da busca) e 24px+ em ícones decorativos
 * grandes (estados vazios, heróis).
 * Fase 7: os valores fora da escala (10, 11, 13, 15, 17, 19, 21) foram
 * migrados para o valor da escala mais próximo em todo o app.
 */
export const ICON_SIZE = {
  xxs: 12,
  xs: 14,
  sm: 16,
  md: 18,
  lg: 22,
} as const;

export type IconSizeToken = keyof typeof ICON_SIZE;
