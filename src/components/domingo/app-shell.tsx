import Link from "next/link";
import type { ReactNode } from "react";

import { DomingoLogo } from "@/components/domingo/logo";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" aria-label="На главную">
          <DomingoLogo />
        </Link>
        <nav aria-label="Основная навигация">
          <Link href="/">Демо</Link>
          <Link href="/components">Компоненты</Link>
          <Link href="/staff">Сотрудникам</Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer>Тестовое окружение · без реальных данных гостей</footer>
    </div>
  );
}
