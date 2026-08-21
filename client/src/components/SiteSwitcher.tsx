import type { ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { sites, currentSiteKey } from "@/lib/siteConfig";

interface SiteSwitcherProps {
  title: ReactNode;
  titleClassName: string;
  chevronClassName: string;
}

// Shared site-switcher used by every site's header title. Always lists all
// three sites, alphabetically, including the one currently open — clicking
// the current site is a plain <a> to its bare URL, which forces a full
// reload and drops any filter query params back to their defaults.
export function SiteSwitcher({ title, titleClassName, chevronClassName }: SiteSwitcherProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 group outline-none">
        <h1 className={titleClassName}>{title}</h1>
        <ChevronDown className={chevronClassName} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="rounded-none border-2 border-black bg-black text-white p-0 min-w-[240px]">
        {sites.map((site) => {
          const isCurrent = site.key === currentSiteKey;
          return (
            <DropdownMenuItem
              key={site.key}
              asChild
              className="rounded-none focus:bg-[var(--switcher-focus)] focus:text-black px-4 py-3 cursor-pointer"
              style={{ ["--switcher-focus" as string]: site.focusColor }}
            >
              <a
                href={site.url}
                className={`font-black uppercase tracking-wide text-sm flex items-center gap-2 w-full hover:text-black ${isCurrent ? "text-white/60" : "text-white"}`}
              >
                <span>{site.emoji}</span>
                <span className="flex-1">{site.name}</span>
                {isCurrent && (
                  <span className="text-[10px] normal-case font-medium tracking-normal opacity-90 shrink-0">
                    you are here
                  </span>
                )}
              </a>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
