import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { StoreProvider } from "@/lib/store";
import { ThemeProvider } from "@/lib/theme";
import { Composer, type ComposeState } from "@/components/MailModule";

const render = (state: ComposeState) =>
  renderToString(
    <ThemeProvider>
      <StoreProvider>
        <Composer state={state} onClose={() => {}} onSent={() => {}} />
      </StoreProvider>
    </ThemeProvider>,
  );

// Regression: the composer used to reference undefined attachment state and
// threw a ReferenceError the moment "New message" was clicked.
describe("email composer", () => {
  it("opens a new email without crashing and shows Send / Attach / Write with AI", () => {
    const html = render({ mode: "new", channel: "email" });
    expect(html).toContain("Send");
    expect(html).toContain("Attach");
    expect(html).toContain("Write with AI");
    expect(html).toContain("Save draft");
  });

  it("opens a new WhatsApp chat without crashing", () => {
    expect(render({ mode: "new", channel: "whatsapp" }).length).toBeGreaterThan(200);
  });
});
