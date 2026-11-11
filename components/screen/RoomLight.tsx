"use client";

/**
 * Reflexo da imagem em projeção no fundo da página, como a luz que a tela
 * joga na sala. Uma camada fixa: a cor troca por `background-color` e a forma
 * vem de uma máscara estática — nada de filtro nem de variável herdada.
 */
export function RoomLight({ color }: { color: string | null }) {
  return <div className="pj-room" aria-hidden="true" style={color ? { backgroundColor: color } : undefined} data-on={color ? "true" : "false"} />;
}
