"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useCallback, useRef, useState } from "react";
import { AccountMenu } from "@/components/AccountPanel";
import { MenuSheet, type SheetAccount } from "@/components/MenuSheet";
import { SignInButton } from "@/components/SignInDialog";
import { navLabel, type TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { accountMenuFor, activeNavHref, navFor, startedFrom, type NavItem } from "@/lib/roles";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

/** roles.ts keeps English labels (its tests assert them); translate at the edge. */
function translateItems(t: TFunction, items: readonly NavItem[]): NavItem[] {
  return items.map(([href, label]) => [href, navLabel(t, label)] as const);
}

function NavLinks({ items, pathname }: { items: readonly NavItem[]; pathname: string | null }) {
  const active = pathname === null ? null : activeNavHref(pathname, items.map(([href]) => href));
  return (
    <div className="flex items-center gap-4 lg:gap-5">
      {items.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={href === active ? "page" : undefined}
          className={
            href === active
              ? "font-semibold text-ink underline decoration-blue-700 decoration-[3px] underline-offset-8"
              : "text-zinc-600 hover:text-ink"
          }
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

// usePathname can suspend under cacheComponents, so it lives in its own boundary.
function ActiveNavLinks({ items }: { items: readonly NavItem[] }) {
  return <NavLinks items={items} pathname={usePathname()} />;
}

function MenuButton({ open, onClick, buttonRef }: { open: boolean; onClick?: () => void; buttonRef?: React.Ref<HTMLButtonElement> }) {
  const t = useT();
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={t("menu.open")}
      aria-expanded={open}
      aria-controls="site-menu"
      aria-haspopup="dialog"
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-lg text-zinc-700 hover:bg-zinc-100"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    </button>
  );
}

function PhoneMenu({ items, account }: { items: readonly NavItem[]; account: SheetAccount }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const onClose = useCallback(() => {
    setOpen(false);
    button.current?.focus();
  }, []);
  return (
    <>
      <MenuButton open={open} onClick={() => setOpen(true)} buttonRef={button} />
      <MenuSheet open={open} onClose={onClose} items={items} active={activeNavHref(pathname, items.map(([href]) => href))} account={account} />
    </>
  );
}

/** The header links and account area (desktop bar) plus the phone menu button. Teachers get their own links and never "Get started". */
export function SiteNav() {
  const student = useStudent();
  const t = useT();
  const { role, auth, ready, sessionChecked } = student;

  // Until the stored state is known, same-height placeholders: no links to flash and swap.
  if (!ready || !sessionChecked) {
    return (
      <>
        <div className="hidden h-9 md:block" />
        <div className="ml-auto hidden h-9 w-40 md:block" />
        <div className="ml-auto size-11 md:hidden" />
      </>
    );
  }

  const started = startedFrom(student);
  const items = translateItems(t, navFor(role, { signedIn: !!auth, started }));
  const menu = translateItems(t, accountMenuFor(role));
  const name = student.teacherProfile?.displayName ?? auth?.email?.split("@")[0] ?? t("account.fallbackName");
  const signOut = () => void student.signOut();
  const account: SheetAccount = auth
    ? { kind: "signedIn", name, title: auth.email ? `${name} (${auth.email})` : name, items: menu, onSignOut: signOut }
    : { kind: "signedOut", items: started ? menu : [], getStarted: !started };

  return (
    <>
      <div className="hidden items-center md:flex">
        <Suspense fallback={<NavLinks items={items} pathname={null} />}>
          <ActiveNavLinks items={items} />
        </Suspense>
      </div>
      <div className="ml-auto hidden items-center gap-4 md:flex">
        {auth ? (
          <AccountMenu label={name} title={auth.email ? `${name} (${auth.email})` : name} items={menu} onSignOut={signOut} />
        ) : (
          <>
            <SignInButton className={buttonClass("quiet", "sm")}>{t("account.signIn")}</SignInButton>
            {started ? <AccountMenu label={t("account.more")} items={menu} /> : (
              <Link href="/start" className={buttonClass("primary", "sm")}>
                {t("account.getStarted")}
              </Link>
            )}
          </>
        )}
      </div>
      <div className="ml-auto md:hidden">
        <Suspense fallback={<MenuButton open={false} />}>
          <PhoneMenu items={items} account={account} />
        </Suspense>
      </div>
    </>
  );
}
