// netlify/functions/fortune.js
// Serverless function for the 2026 Auspicious Year Report
// IMPORTANT: Set environment variables in Netlify:
//   OPENAI_API_KEY   -> your OpenAI API key
//   EXPIRY_DATE      -> e.g., 2026-04-30
//   SIGN_OFF_HTML    -> optional override for sign-off block
//
// No personal data is stored. DoB is used only to generate a one-time report.

const EXPIRY_MESSAGE = "This service has ended. Thank you for your interest.";

// Helper to build JSON response
function json(body, status = 200) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// Strict DOB format: DDMMMYYYY (e.g., 08DEC1977)
function isValidDOB(dob) {
  return /^\d{2}[A-Z]{3}\d{4}$/.test(dob);
}

function getDefaultSignOff() {
  return `
  <div class="signoff">
    — <strong>Prepared by Mike Lim</strong>, CEA Reg No. R026708F<br/>
    📞 +65 9692 9209<br/>
    <strong>SGHomeCompass | Your Chapter in Home Transition</strong><br/>
    🔗 <a href="https://www.youtube.com/@SGHomeCompass" target="_blank" rel="noopener">YouTube</a>  |  
       <a href="https://www.instagram.com/sghomecompass/" target="_blank" rel="noopener">Instagram</a>
  </div>`;
}

function buildPrompt(dob) {
  return `You are generating a concise, upbeat 2026 Auspicious Report for entertainment only.
User supplied a date of birth: ${dob}. Use it to personalize lightly via zodiac/numerology style cues.
Singapore audience; keep language clear, non-mystical, and avoid absolutes.
Length target: 170–220 words.

Return ONLY HTML with these sections (use <h3> and <p> tags):
<h3>Overall Outlook (2026)</h3>
... 2–3 sentences.
<h3>Career & Wealth</h3>
... 3–4 sentences with one practical focus month.
<h3>Relationships & Network</h3>
... 2–3 sentences.
<h3>Health & Energy</h3>
... 2–3 sentences with one sustainable habit.
<h3>Home & Property (Practical Feng Shui Angle)</h3>
... 3–4 sentences, include a simple declutter/refresh tip and a month window.
<h3>Lucky Anchor</h3>
... 1 colour or element + one weekly reset ritual.

Rules:
- Do NOT request or store personal data beyond the DOB given.
- Avoid medical/financial claims; use “tendencies” and “energy” language.
- Keep it positive, specific, and mobile-friendly paragraphs.
`;
}

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable.");
  }

  // Using the Responses API for modern compatibility
  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: prompt,
      max_output_tokens: 700
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI API error: ${resp.status} ${errText}`);
  }
  const data = await resp.json();
  // The Responses API returns output in "output_text" as a convenience
  const text = data.output_text || (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  return text;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json({ message: "Use POST /api/fortune" }, 405);
    }

    // Expiry / kill-switch
    const expiry = process.env.EXPIRY_DATE ? new Date(process.env.EXPIRY_DATE) : null;
    if (expiry && new Date() > expiry) {
      return json({ resultHtml: `<p>${EXPIRY_MESSAGE}</p>` });
    }

    const body = JSON.parse(event.body || "{}");
    const dob = (body.dob || "").toUpperCase().trim();

    if (!isValidDOB(dob)) {
      return json({ message: "Please use DDMMMYYYY, e.g., 08DEC1977." }, 400);
    }

    // Off-topic guardrail: if someone passes non-DOB text, we’ve already validated above.
    const prompt = buildPrompt(dob);
    const html = await callOpenAI(prompt);

    const signOff = process.env.SIGN_OFF_HTML || getDefaultSignOff();
    const resultHtml = `${html}\n${signOff}`;

    // No storage; return directly
    return json({ resultHtml });
  } catch (err) {
    console.error(err);
    return json({ message: "Server error. Please try again later." }, 500);
  }
};
