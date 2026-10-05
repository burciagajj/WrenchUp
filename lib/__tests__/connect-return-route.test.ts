import { describe, it, expect } from "vitest";
import { GET } from "../../app/api/connect-return+api";

describe("connect-return page", () => {
  it("hands the mechanic back to the app after onboarding", async () => {
    const res = await GET(new Request("https://wrenchup.expo.app/api/connect-return?result=return"));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("wrenchup://mechanic/payouts-return?result=return");
  });

  it("only ever links to the two allowed results, never reflecting input", async () => {
    const res = await GET(new Request("https://wrenchup.expo.app/api/connect-return?result=%22%3E%3Cscript%3Ealert(1)%3C/script%3E"));
    const html = await res.text();
    expect(html).toContain("result=return");
    expect(html).not.toContain("alert(1)");
    const refresh = await (await GET(new Request("https://wrenchup.expo.app/api/connect-return?result=refresh"))).text();
    expect(refresh).toContain("result=refresh");
  });
});
