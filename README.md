This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment variables

Set these in the host environment (for example Vercel). Do not commit values.

- `AGENT_SEARCH_API_KEY`
- `AGENT_SEARCH_PROJECT_ID` (optional)
- `AGENT_SEARCH_ENGINE_ID` (optional)
- `GEMINI_API_KEY` (the written guide and the "From around the web" picks stay hidden when this is unset)
- `GEMINI_MODEL` (optional, defaults to `gemini-flash-lite-latest`)
- `TAVILY_API_KEY` (optional — web article search works without it on Tavily's free keyless limit; set a free key if that limit runs out)
- `YOUTUBE_API_KEY` (optional — food and places videos stay hidden when this is unset)

## From around the web

After a city search, the results page can show a **From around the web** section. It looks up a few articles about where to eat and what to do, reads the pages, and asks Gemini for short picks. Each pick links back to the article it came from. Diet and activity choices are included, the same way they are for the guide. With nothing selected, the request is `/api/web?city=Tokyo`. With choices, the link keeps the sorted `diet` and `interest` parameters, and that full URL is cached for 3 days.

The section disappears when the Gemini key is missing or when search, reading, or the model fails. The rest of the page still works.

Article search does not use the TikTok Agent Search engine. That engine only searches TikTok. A separate Agent Search website app would be a paid Enterprise feature and still could not search the open web, so none is required. Search uses Tavily's free keyless mode, plus the public Wikivoyage API for the city guide. Pages that block the request, or whose robots.txt disallows it, are skipped.

## Preferences

The search can include a diet and the kinds of things someone wants to do. Both are optional. Everyday diets (vegetarian, vegan, halal, kosher, gluten-free, dairy-free, nut-free) and a few activities (sports and cafe hopping, plus a few more) are chips. Anything else can be typed in.

With nothing selected, a city search is the same as before. Choices are saved in the browser and added to the link, for example `?q=Tokyo&diet=vegan&interest=cafe-hopping`. The guide, place search, video searches, and web articles receive the same `diet` and `interest` values when those values apply to that search. Cached responses use the full URL, so a vegan Tokyo guide is stored separately from a generic one.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
