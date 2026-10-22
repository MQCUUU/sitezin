"use client";


import "@/styles/features/states.css";
import {
  NotFoundState,
} from "@/components/AsyncState";
import { BrandMark } from "@/components/brand/BrandMark";

export default function NotFound() {
  return (
    <div className="mc-route-error">
      {/* V3.5: o 404 é do MyCatalog, não uma tela genérica. */}
      <div className="mc-route-brand">
        <BrandMark size={56} />
      </div>
      <NotFoundState
        title="Essa página não existe"
        description="Talvez o endereço esteja errado ou esse conteúdo tenha sido removido."
      />
    </div>
  );
}
