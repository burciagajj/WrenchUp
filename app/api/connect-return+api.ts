// Stripe only accepts https return_url / refresh_url for live-mode Account
// Links, so the app's own deep link can't be given to Stripe directly. This
// page is the https landing spot: Stripe sends the mechanic here when they
// finish (or back out of, or need to restart) hosted onboarding, and it hands
// them back into the app. The Earnings screen re-checks payout status when the
// app returns to the foreground, so even if the redirect is blocked the
// mechanic can just switch back to WrenchUp. Nothing here reads user input
// beyond a two-value allowlist, and the deep link target is a constant.

// Must match `scheme` in app.config.ts and urlScheme in components/stripe-provider.tsx.
const APP_SCHEME = "wrenchup";

export async function GET(request: Request) {
  const result = new URL(request.url).searchParams.get("result") === "refresh" ? "refresh" : "return";
  const deepLink = `${APP_SCHEME}://mechanic/payouts-return?result=${result}`;
  const heading = result === "refresh" ? "Let's pick up where you left off" : "Payout setup submitted";
  const body =
    result === "refresh"
      ? "Your setup link expired or was already used. Open WrenchUp and tap Set up payouts again to continue."
      : "Thanks. Stripe is reviewing your details. Open WrenchUp to see your payout status.";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WrenchUp payouts</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1220;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;padding:24px;box-sizing:border-box}
  main{max-width:420px;text-align:center}
  h1{font-size:22px;margin:0 0 12px}
  p{color:#94a3b8;line-height:1.5;margin:0 0 24px}
  a{display:inline-block;background:#f97316;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:10px}
</style>
</head>
<body>
<main>
  <h1>${heading}</h1>
  <p>${body}</p>
  <a href="${deepLink}">Open WrenchUp</a>
</main>
<script>setTimeout(function(){ window.location.href = ${JSON.stringify(deepLink)}; }, 400);</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
