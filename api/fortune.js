// api/fortune.js
//
// Vercel Serverless Function for the 2026 Auspicious Year Report.
// - POST JSON { dob: "08DEC1977", language: "en" | "zh" }
// - Hard stop date: 31 Mar 2026 (inclusive)
// - Uses OpenAI Chat Completions API (gpt-4.1-mini)

async function parseJsonBody(req) {
  // In many Vercel runtimes, req.body may already be an object.
  if (req.body) {
    if (typeof req.body === "string") {
      return JSON.parse(req.body || "{}");
    }
    return req.body;
  }

  // Fallback: manual stream read (Node.js IncomingMessage)
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", (err) => reject(err));
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    res
      .status(500)
      .json({ error: "Server misconfigured: missing OPENAI_API_KEY." });
    return;
  }

  // Hard stop date for the 2026 campaign (inclusive)
  const EXPIRY_DATE = "2026-03-31";
  const now = new Date();
  const expiry = new Date(`${EXPIRY_DATE}T23:59:59Z`);

  if (Number.isNaN(expiry.getTime())) {
    console.error("Invalid EXPIRY_DATE configured:", EXPIRY_DATE);
  } else if (now > expiry) {
    res.status(410).json({
      error:
        "This 2026 Auspicious Report campaign has ended. Please check back for future editions.",
    });
    return;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (err) {
    console.error("Failed to parse JSON body:", err);
    res.status(400).json({ error: "Invalid JSON body." });
    return;
  }

  const dob = typeof body.dob === "string" ? body.dob.trim() : "";
  const lang = body.language === "zh" ? "zh" : "en";

  if (!dob) {
    res.status(400).json({
      error:
        "Missing or invalid 'dob'. Please provide DDMMMYYYY (e.g. 08DEC1977).",
    });
    return;
  }

  const languageInstruction =
    lang === "zh"
      ? "Write the entire report in natural, fluent Simplified Chinese suitable for readers in Singapore. Keep the HTML structure and section headings consistent."
      : "Write the entire report in English. Keep the HTML structure and section headings consistent.";

  const sectionsInstruction = `
Please generate a personalised 2026 Auspicious Year Report for the following person.

Date of birth: ${dob}

Use a warm, encouraging, grounded tone. Avoid fatalistic or overly superstitious wording. Keep it modern and practical.

Structure the report using HTML with the following sections, in this order:

1) Overview
2) Career and Wealth
3) Family and Relationships
4) Energy and Health
5) Personal Growth and Hurdles
6) Practical Dos & Don'ts for 2026  (this must be a bullet list)

HTML requirements:
- Use <h2> or <h3> for section headings.
- Use <p> for paragraphs.
- For the "Practical Dos & Don'ts for 2026" section, use <ul> and <li>.
- Each bullet in that section must start with "Do:" or "Don't:" exactly, followed by the advice sentence.
- Overall length should feel like a one-page reading: meaningful but not overly long.
`;

  const prompt = `${languageInstruction}\n\n${sectionsInstruction}`;

  try {
    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "system",
              content:
                "You are an experienced feng shui and astrology consultant creating friendly, practical 2026 readings. You never give medical, legal, or financial advice. You avoid fear-based or deterministic forecasts and instead focus on gentle guidance.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.8,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("OpenAI API error:", response.status, text);
      res.status(502).json({
        error:
          "OpenAI API error. Please try again later or contact the site owner if this persists.",
      });
      return;
    }

    const data = await response.json();
    const html =
      data?.choices?.[0]?.message?.content?.trim() ||
      "<p>Sorry, the report could not be generated. Please try again later.</p>";

    res.status(200).json({ html });
  } catch (err) {
    console.error("Unexpected error in fortune handler:", err);
    res.status(500).json({
      error: "Unexpected server error. Please try again later.",
    });
  }
}
