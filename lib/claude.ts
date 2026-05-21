// lib/claude.ts

export async function analyzeCarProblem(
    problemDescription: string,
    vehicleInfo: string
  ) {
    try {
      const response = await fetch('/api/claude', {   // ← This calls your API route
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Vehicle: ${vehicleInfo}\nProblem: ${problemDescription}\nAnalyze this car problem and give clear recommendations.`
          }]
        })
      });
  
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
  
      const data = await response.json();
      return data;   // This will contain Claude's response
  
    } catch (error) {
      console.error("Claude API Error:", error);
      throw error;
    }
  }