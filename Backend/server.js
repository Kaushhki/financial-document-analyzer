import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
import fs from "fs";
import multer from "multer";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

dotenv.config();
console.log("Node version:", process.version);
console.log("KEY LOADED:", process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.slice(0, 8) + "..." : "MISSING");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const upload = multer({ dest: "uploads/" });

// ---------- In-memory document store ----------
// Maps docId -> array of text chunks. Resets when the server restarts.
// (For a real deployment you'd swap this for a database, but this is
// perfectly fine for a student project / demo.)
const documentStore = new Map();

// ---------- Helpers ----------

function chunkText(text, chunkSize = 3000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

// Very simple keyword-overlap scorer used to find which chunks are most
// relevant to a given question, so we only send a handful of chunks to
// Groq instead of the entire document every time.
function scoreChunk(chunk, queryWords) {
  const chunkLower = chunk.toLowerCase();
  let score = 0;
  for (const word of queryWords) {
    if (!word) continue;
    const matches = chunkLower.split(word).length - 1;
    score += matches;
  }
  return score;
}

function getRelevantChunks(docId, query, topK = 5) {
  const chunks = documentStore.get(docId);
  if (!chunks) return [];

  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  const scored = chunks.map((chunk, i) => ({
    chunk,
    index: i,
    score: scoreChunk(chunk, queryWords)
  }));

  scored.sort((a, b) => b.score - a.score);

  // Fallback: if nothing scored (e.g. very generic question), just return
  // the first few chunks rather than nothing at all.
  const top = scored.filter(s => s.score > 0).slice(0, topK);
  if (top.length === 0) {
    return chunks.slice(0, topK);
  }
  return top.map(s => s.chunk);
}

// Calls Groq's chat completions endpoint, with automatic retry on
// rate-limit errors (waits and tries again a few times before giving up).
async function callGroq(systemPrompt, userContent, retries = 3) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    if (data.error?.message?.includes("Rate limit") && retries > 0) {
      console.log("Rate limited, waiting 15s before retry...");
      await new Promise(r => setTimeout(r, 15000));
      return callGroq(systemPrompt, userContent, retries - 1);
    }
    throw new Error(data.error?.message || "Groq API error");
  }

  return data.choices[0].message.content;
}

// ---------- Routes ----------

// Upload + parse a PDF, extract raw text. Used by the frontend as a
// fallback / alternative to client-side pdf.js extraction.
app.post("/api/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const dataBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(dataBuffer);
    const extractedText = pdfData.text;

    res.json({
      text: extractedText,
      numPages: pdfData.numpages
    });
  } catch (error) {
    console.error("Analyze error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    // Clean up the temp uploaded file regardless of success/failure
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
  }
});

// Index a document's extracted text into the in-memory chunk store.
// This is instant (no AI calls) — just splits text.
app.post("/api/index", (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "No text provided" });

  const docId = "doc_" + Date.now();
  const chunks = chunkText(text, 3000);
  documentStore.set(docId, chunks);

  console.log(`Indexed document ${docId}: ${chunks.length} chunks`);
  res.json({ docId, numChunks: chunks.length });
});

// Answer a question about an already-indexed document. Only pulls the
// most relevant few chunks instead of sending the whole document, so
// this stays fast and well within Groq's rate limits.
app.post("/api/chat", async (req, res) => {
  const { query, docId } = req.body;

  if (!docId || !documentStore.has(docId)) {
    return res.status(400).json({ error: "No indexed document found. Please upload a document first." });
  }
  if (!query) {
    return res.status(400).json({ error: "No query provided" });
  }

  try {
    const relevantChunks = getRelevantChunks(docId, query, 5);
    const context = relevantChunks.join("\n\n---\n\n");

    const systemPrompt = `You are a financial document analysis expert. Use the following excerpts from the document to answer the user's question accurately. If the excerpts don't contain enough information to answer, say so honestly rather than guessing.

Relevant excerpts:
${context}

Provide detailed, accurate analysis based on these excerpts. Cite specific figures where available.`;

    const answer = await callGroq(systemPrompt, query);
    res.json({ response: answer });

  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
