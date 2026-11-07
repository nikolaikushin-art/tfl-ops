import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { StoreProvider } from "@/lib/store";
import { ThemeProvider } from "@/lib/theme";
import { AppShell, NAV_GROUPS, HUBS, type AppSection } from "@/components/Shell";

const esc = (t: string) => t.replace(/&/g, "&amp;");
const render = (section: AppSection) =>
  renderToString(
    <ThemeProvider>
      <StoreProvider>
        <AppShell section={section} onSelect={() => {}} onOpenSearch={() => {}}>
          <div>page</div>
        </AppShell>
      </StoreProvider>
    </ThemeProvider>,
  );

describe("two-sidebar shell", () => {
  it("main sidebar lists every group and page, with collapse + footer", () => {
    const html = render("dashboard");
    for (const g of NAV_GROUPS) {
      expect(html).toContain(`<span>${esc(g.label)}</span>`);
      for (const i of g.items) if (i.id !== "residency") expect(html).toContain(esc(i.label));
    }
    expect(html).toContain("mnav");
    expect(html).toContain("Collapse navigation");
    expect(html).toContain("Sign out");
    expect(html).toContain("Toggle theme");
  });

  it("TFL has no hub tabs: every nav page opens on its own", () => {
    expect(Object.keys(HUBS).length).toBe(0);
    for (const id of ["tfl-locations", "tfl-owners", "tfl-bookings", "tfl-invoices"] as AppSection[]) {
      expect(render(id)).toContain("mnav");
    }
  });

  it("renders every section without crashing", () => {
    for (const g of NAV_GROUPS) for (const i of g.items) expect(render(i.id).length).toBeGreaterThan(500);
  });

  it("phone top bar has the menu button and shows the page name", () => {
    const html = render("tfl-locations");
    expect(html).toContain("rs-mhead");
    expect(html).toMatch(/aria-label="(Locations sections|Menu)"/);
    expect(html).toContain("<b>Locations</b>");
    expect(html).not.toContain("mtabs");
    expect(render("dashboard")).toContain("rs-mhead");
  });
});
