"use client";

import {
  NotFoundState,
} from "@/components/AsyncState";

export default function NotFound() {
  return (
    <div className="mc-route-error">
      <NotFoundState
        title="Essa página não existe"
        description="Talvez o endereço esteja errado ou esse conteúdo tenha sido removido."
      />
    </div>
  );
}