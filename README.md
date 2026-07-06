# Financial Document Analyzer

An AI-powered web application that analyzes financial documents using Large Language Models (LLMs).

## Live Demo
doc-sage-sepia.vercel.app/DocumentAnalyzer.html

## Features

- Upload PDF, TXT, CSV files
- AI-based financial analysis
- Chat interface for querying documents
- Extract key financial insights
- Quick action prompts (metrics, trends, risks)

## Tech Stack

Frontend:
- React (CDN)
- HTML, CSS, JavaScript
- PDF.js

Backend:
- Node.js
- Express.js

AI Integration:
- Groq API (LLaMA3)

## How It Works

1. Upload financial documents  
2. Extract text from files  
3. Send context and query to AI model  
4. Receive financial insights  

## Project Structure
financial-analyzer/
│
├── backend/
│ ├── server.js
│ ├── package.json
│
├── frontend/
│ └── index.html
│
├── .gitignore
└── README.md

## Setup Instructions
Backend:

cd backend
npm install
node server.js

Frontend:

Open the HTML file in your browser or use Live Server.

## Environment Variables

Create a `.env` file inside backend:


GROQ_API_KEY=your_api_key_here


## Notes

- Do not upload `.env` file
- This project uses a simplified RAG-like approach

## Future Improvements

- Implement full RAG with vector database  
- Add financial dashboards  
- Deploy frontend and backend  
- Add authentication system  

## Contributing

Feel free to fork and improve this project.
