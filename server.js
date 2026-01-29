const express = require('express');
const cors = require('cors');
const axios = require('axios');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Real search function using NewsAPI
async function searchNews(newsText) {
    try {
        const apiKey = process.env.NEWS_API_KEY;
        if (!apiKey) {
            throw new Error('NEWS_API_KEY not found in environment variables');
        }

        const keywords = newsText.split(' ').slice(0, 5).join(' '); // Take first 5 words as search query

        const response = await axios.get(`https://newsapi.org/v2/everything`, {
            params: {
                q: keywords,
                apiKey: apiKey,
                language: 'en',
                sortBy: 'relevancy',
                pageSize: 5
            }
        });

        // Transform NewsAPI response to match expected format
        const searchResults = response.data.articles.map(article => ({
            title: article.title,
            url: article.url,
            snippet: article.description || 'No description available.'
        }));

        return searchResults;
    } catch (error) {
        console.error('Error searching news:', error.message);
        // Fallback to mock results if API fails
        return [
            {
                title: `Search Error: ${error.message}`,
                url: '#',
                snippet: 'Unable to fetch real search results. Please check API key.'
            }
        ];
    }
}

// AI analysis function using OpenAI
async function analyzeWithAI(newsText, searchResults) {
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY not found in environment variables');
        }

        const searchContext = searchResults.map(result =>
            `Title: ${result.title}\nSnippet: ${result.snippet}\nURL: ${result.url}`
        ).join('\n\n');

        const prompt = `Analyze the following news text and determine if it's likely fake or real news. Use the provided search results as context to verify the claims.

News Text: "${newsText}"

Search Results:
${searchContext}

Please provide:
1. A verdict: "REAL" or "FAKE"
2. Confidence level (0-100%)
3. A brief explanation of your reasoning

Format your response as JSON:
{
  "verdict": "REAL" or "FAKE",
  "confidence": 85,
  "explanation": "Brief explanation here"
}`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: 'You are a fact-checking AI that analyzes news for authenticity.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 500,
            temperature: 0.3
        });

        const response = completion.choices[0].message.content.trim();
        const aiResult = JSON.parse(response);

        return {
            verdict: aiResult.verdict.toUpperCase(),
            confidence: Math.min(Math.max(aiResult.confidence, 0), 100),
            explanation: aiResult.explanation
        };
    } catch (error) {
        console.error('Error with AI analysis:', error.message);
        // Fallback to keyword-based analysis
        return {
            verdict: 'UNKNOWN',
            confidence: 50,
            explanation: 'AI analysis failed, using fallback method.'
        };
    }
}

app.post('/analyze', async (req, res) => {
    try {
        const { newsText } = req.body;

        if (!newsText) {
            return res.status(400).json({ error: 'News text is required' });
        }

        // Perform web search
        const searchResults = await searchNews(newsText);

        // Keyword-based analysis
        const fakeKeywords = ['fake', 'hoax', 'conspiracy', 'viral', 'shocking', 'unbelievable', 'secret', 'exposed', 'misinformation', 'false', 'lie', 'fabricated', 'scam', 'fraud', 'deception', 'rumor', 'speculation'];
        const realKeywords = ['official', 'confirmed', 'source', 'report', 'government', 'verified', 'authentic', 'reliable', 'fact', 'true', 'evidence', 'proof', 'statement', 'announcement', 'press release', 'declaration'];

        let fakeScore = 0;
        let realScore = 0;

        const words = newsText.toLowerCase().split(/\s+/);
        const totalWords = words.length;

        words.forEach(word => {
            if (fakeKeywords.includes(word)) fakeScore += 2;
            if (realKeywords.includes(word)) realScore += 2;
        });

        // Additional heuristics
        if (newsText.includes('!') || newsText.includes('?')) fakeScore += 0.5;
        if (newsText.match(/\b\d{4}\b/)) realScore += 0.5; // Year mentions
        if (totalWords > 100) realScore += 1; // Longer articles tend to be more credible

        // Check for official sources in search results
        const hasOfficialSources = searchResults.some(result =>
            result.url.includes('gov') ||
            result.url.includes('official') ||
            result.url.includes('factcheck') ||
            result.title.toLowerCase().includes('official')
        );

        if (hasOfficialSources) realScore += 3;

        const totalScore = fakeScore + realScore;
        let keywordConfidence = totalScore > 0 ? Math.min((Math.abs(fakeScore - realScore) / totalScore) * 100, 95) : 50;

        let keywordResult;
        if (fakeScore > realScore) {
            keywordResult = 'FAKE';
        } else if (realScore > fakeScore) {
            keywordResult = 'REAL';
        } else {
            // If tied, check search results
            keywordResult = hasOfficialSources ? 'REAL' : 'FAKE';
            keywordConfidence = Math.max(keywordConfidence - 10, 20);
        }

        // AI analysis
        const aiAnalysis = await analyzeWithAI(newsText, searchResults);

        // Combine results: Prefer AI if available, else use keyword
        let finalResult, finalConfidence, explanation;
        if (aiAnalysis.verdict !== 'UNKNOWN') {
            finalResult = aiAnalysis.verdict;
            finalConfidence = aiAnalysis.confidence;
            explanation = aiAnalysis.explanation;
        } else {
            finalResult = keywordResult;
            finalConfidence = keywordConfidence;
            explanation = 'AI analysis unavailable, using keyword-based analysis.';
        }

        res.json({
            result: finalResult,
            confidence: Math.round(finalConfidence),
            hasOfficialSources,
            sourcesFound: searchResults.length,
            searchResults,
            explanation
        });

    } catch (error) {
        console.error('Error analyzing news:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
