import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { OnboardingForm } from "@/components/OnboardingForm";
import { buildKycLink } from "@/lib/kycLink";
describe("public form", () => {
  it("renders from a link with no store", () => {
    const link = buildKycLink("https://x", { token: "abc123", name: "Acme", roles: ["buyer"], docs: ["Director ID"] });
    const html = renderToString(<OnboardingForm hash={link.slice(link.indexOf("#"))} />);
    expect(html).toContain("Onboarding");
    expect(html).toContain("Director ID");
    expect(renderToString(<OnboardingForm hash="#/onboarding/!!" />)).toContain("send it again");
  });
});
