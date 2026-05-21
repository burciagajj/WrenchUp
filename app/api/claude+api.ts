export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Debug logs - put these HERE
    console.log("🔑 ANTHROPIC_API_KEY loaded:", !!process.env.ANTHROPIC_API_KEY);
    console.log("🔑 Key starts with:", process.env.ANTHROPIC_API_KEY?.substring(0, 20) + "...");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!, 
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return Response.json(data);

  } catch (error) {
    console.error("Claude API Error:", error);
    return Response.json({ error: "Failed to call Claude" }, { status: 500 });
  }
}