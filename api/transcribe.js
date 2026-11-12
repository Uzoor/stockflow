// api/transcribe.js  (Vercel serverless function, no framework needed)
// Turns a voice note into text with Groq Whisper.
// Required env var in Vercel: GROQ_API_KEY
// Optional overrides: SUPABASE_URL, SUPABASE_ANON_KEY (defaults are the public values from index.html)
const SUPABASE_URL = process.env.SUPABASE_URL || "https://nxqlujwqavqpvliccmdc.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54cWx1andxYXZxcHZsaWNjbWRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4ODAzMDQsImV4cCI6MjEwNzQ1NjMwNH0.niE9DzY6bOQ9L6jNBGpLO7EOEjJu8Kr5UiRbDOHAcVY";
const MAX_BYTES = 4000000; // Vercel request limit is about 4.5 MB; a 60 s voice note is far smaller

const EXT = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav" };

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "POST only" }); }
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: "Voice is not set up yet (missing GROQ_API_KEY)." });

  try {
    // 1. Only signed-in dashboard users (same check the n8n "Verify User" node does).
    const who = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: req.headers.authorization || "" },
    });
    if (!who.ok) return res.status(401).json({ error: "Please sign in again." });

    // 2. Read the raw audio body.
    const chunks = []; let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BYTES) return res.status(413).json({ error: "Voice note too long. Keep it under a minute." });
      chunks.push(c);
    }
    const buf = Buffer.concat(chunks);
    if (buf.length < 1000) return res.status(400).json({ error: "No audio received." });

    // 3. Transcribe with Groq Whisper.
    const type = String(req.headers["content-type"] || "audio/webm").split(";")[0];
    const fd = new FormData();
    fd.append("file", new Blob([buf], { type }), "voice." + (EXT[type] || "webm"));
    fd.append("model", "whisper-large-v3-turbo");
    fd.append("language", "en");
    fd.append("response_format", "json");
    fd.append("temperature", "0");
    fd.append("prompt", "Stock update from a Nigerian trader: sold 10 bags of rice, received 20 cartons of tomato paste, bags of beans, garri, pieces, cartons.");

    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.GROQ_API_KEY },
      body: fd,
    });
    if (!r.ok) return res.status(502).json({ error: "Transcription failed. Try again." });
    const out = await r.json();
    return res.status(200).json({ text: String(out.text || "").trim() });
  } catch (e) {
    return res.status(500).json({ error: "Voice failed. Try again." });
  }
};
