import 'dotenv/config'
import OpenAI from 'openai'
import * as fs from 'fs'
import * as path from 'path'
import * as process from 'process'
import fetch from 'node-fetch'

if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required')
    process.exit(1)
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

// To save on API costs, I've commented out additional sites while you run 
// initial tests. Uncomment these sites to do a full run of the news audit.
const CHARITY_NEWS_WEBSITES = [
    // "https://www.thirdsector.co.uk/news",
    // "https://www.civilsociety.co.uk/",
    // "https://www.charitytoday.co.uk/",
    "https://www.bbc.co.uk/news/topics/c9z6w63q5elt"
]

async function crawlAllNewsSources() {
    console.log('Starting news crawl...')
  
    // Create data directory if it doesn't exist
    if (!fs.existsSync('data')) {
        fs.mkdirSync('data')
    }

    const allArticles = []
  

    for (const pageUrl of CHARITY_NEWS_WEBSITES) {
        console.log(`🔍 Analyzing HTML from: ${pageUrl}`)
      
        try {
            const articles = await extractArticlesFromPage(pageUrl)
            allArticles.push(...articles)
        } catch (error) {
            console.error(`❌ Failed to analyze ${pageUrl}:`, error.message)
        }
    }

    // Save results
    const outputPath = path.join('data', 'crawled-articles.json')
    fs.writeFileSync(outputPath, JSON.stringify(allArticles, null, 2))

    console.log(`Crawl complete! Found ${allArticles.length} recent articles.`)
    console.log(`Results saved to: ${outputPath}.`)
}

/**
 * Extract recent articles from a single news source using AI
 * @param {any} browser - Puppeteer browser instance
 * @param {string} pageUrl - URL of the news source
 * @returns Array of extracted articles from the last 7 days
 */
async function extractArticlesFromPage(pageUrl) {
    const page = await fetch(
        pageUrl,
    )

    const htmlContent = await page.text()
    // console.log('begin\n', htmlContent, '\nend\n')
    const open = htmlContent.indexOf('<main')
    const close = htmlContent.indexOf('</main>')
    const mainContent = htmlContent.substring(open, close)
    console.log(open, close);
    // console.log('begin\n', mainContent, '\nend\n')
    return await analyzeHtmlForRecentArticles(mainContent, pageUrl)
}

/**
 * Use AI to analyze HTML content and extract recent articles
 * @param {string} htmlContent - Full HTML content of the page
 * @param {string} pageUrl - URL of the source page
 * @returns array of recent articles
 */
async function analyzeHtmlForRecentArticles(htmlContent, pageUrl) {
    const currentDate = new Date().toISOString().split('T')[0] // YYYY-MM-DD format
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  
    const systemPrompt = `You are a charity sector news analyst. Analyze this HTML content to extract recent news articles.

    Today's date is: ${currentDate}
    Only extract articles published within the last 7 days (since ${sevenDaysAgo}).

    Look for:
    - Article titles and their URLs
    - Publication dates (look for dates, timestamps, "posted", "published", etc.)
    - Brief descriptions or excerpts
    - Focus on charity/nonprofit sector news

    Respond with JSON in this exact format:
    {
    "articles": [
    {
    "url": "full article URL",
    "title": "article title",
    "description": "brief description or excerpt",
    "publishDate": "YYYY-MM-DD or approximate date"
    }
    ]
    }

    Only include articles that are clearly from the last 7 days. If you can't determine the date, include it but mark publishDate as "unknown".`

    const userPrompt = `HTML Content:
${htmlContent.substring(0, 28000)}...`

    // Todo: experiment with different models and monitor token input / output usage

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-5-nano',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            response_format: { type: 'json_object' }
        })

        const content = response.choices[0]?.message?.content
        if (!content) {
            console.warn(`⚠️ No response from AI for ${pageUrl}`)
            return []
        }

        const result = JSON.parse(content)
        const articles = result.articles || []

        console.log(`📰 Found ${articles.length} recent articles from ${pageUrl}`)
        return articles

    } catch (error) {
        console.error(`❌ AI analysis failed for ${pageUrl}:`, error.message)
        return []
    }
}

await crawlAllNewsSources();
