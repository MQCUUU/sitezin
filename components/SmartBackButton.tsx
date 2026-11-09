"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { hasInAppHistory } from "@/components/ScrollMemory";
import { Button } from "@/components/ui/Button";

/*
 * "Voltar" do app = o mesmo que o botão voltar do navegador quando a página
 * anterior é do próprio site: volta pelo histórico (sem recarregar) e o
 * ScrollMemory devolve a página exatamente onde estava rolada.
 * Sem página anterior no site (link externo, aba nova): vai para a Início.
 *
 * Antes: recarregava a página inteira de origem (location.replace) e só
 * funcionava para quem saiu de uma lista para um título.
 */
export function SmartBackButton({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();

  function goBack() {
    if (hasInAppHistory()) router.back();
    else router.push(fallback);
  }

  return (
    <Button type="button" className="title-back-btn" onClick={goBack}>
      <ArrowLeft size={18} />
      Voltar
    </Button>
  );
}
