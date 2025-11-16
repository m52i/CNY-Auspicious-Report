// netlify/functions/fortune.js
//
// Serverless function for the 2026 Auspicious Year Report.
// - Reads { dob, language } from POST body
// - language: 'en' (English) or 'zh' (Simplified Chinese)
// - Enforces an expiry date
// - Calls OpenAI to generate a HTML report
// - Returns { html: "<h2>...</h2>..." }

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// hard stop date for the service
const EXPIRY_DATE = "2026-04-30"; // YYYY-MM-DD

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    if (!OPENAI_API_KEY) {
      console.error("Missing OPENAI_API_KEY");
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Server configuration error: API key not set.",
        }),
      };
    }

    // Expiry check
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    if (today > EXPIRY_DATE) {
      const html = `
        <div class="expired-message">
          <strong>This service has ended.</strong><br/>
          Thank you for your interest in the 2026 Auspicious Year Report.
        </div>
      `;
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      };
    }

    const { dob, language } = JSON.parse(event.body || "{}");
    const lang = language === "zh" ? "zh" : "en";

    if (!dob || typeof dob !== "string") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: "Missing or invalid 'dob'. Please provide DDMMMYYYY.",
        }),
      };
    }

    const languageInstruction =
      lang === "zh"
        ? "Write the entire report in natural, fluent Simplified Chinese suitable for readers in Singapore. Keep headings and structure clear. IMPORTANT: In the 'Practical Dos & Don'ts for 2026' section, keep the bullet labels beginning with 'Do:' and 'Don't:' in English so the front-end can style them, but the rest of the sentence can be in Chinese."
        : "Write the entire report in English. In the 'Practical Dos & Don'ts for 2026' section, each bullet should start with 'Do:' or 'Don't:' so the front-end can colour them.";

    const prompt = `
Date of birth: ${dob}

Please generate a personalised 2026 auspicious year report based on this birth date using a blend of feng shui, astrology, and numerology themes.

Requirements:
- Write in a warm, encouraging, and grounded tone.
- Structure the report with clear HTML headings and paragraphs <h2>, <h3>, <p>, <ul>, <li>.
- Start with an overview of the general energy for 2026 for this person.
- Then include sections such as: Career & Wealth, Relationships & Family, Health & Well-Being, Personal Growth & Opportunities.
- Include a specific section titled: "Practical Dos & Don'ts for 2026" as a bullet list.
- Each bullet in that section must begin with "Do:" or "Don't:" exactly, followed by the advice sentence.
- Keep the length balanced: meaningful but not overly long, suitable for a one-page reading.

Language rule:
${languageInstruction}
    `.trim();

    // Call OpenAI via fetch
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
              "You are an experienced feng shui and astrology consultant preparing personalised 2026 forecasts. You always stay positive, practical, and non-alarmist.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("OpenAI API error:", response.status, text);
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error:
            "OpenAI API error. Please try again later or contact the site owner.",
        }),
      };
    }

    const data = await response.json();
    const message =
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;

    const html =
      message ||
      `<p>Sorry, I could not generate your report at this time. Please try again later.</p>`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html }),
    };
  } catch (err) {
    console.error("Unexpected error in fortune function:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Unexpected server error. Please try again later.",
      }),
    };
  }
};
