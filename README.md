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
- `YOUTUBE_API_KEY` (optional — food and places videos stay hidden when this is unset)

## Preferences

The search can include a diet and the kinds of things someone wants to do. Both are optional. Everyday diets (vegetarian, vegan, halal, kosher, gluten-free, dairy-free, nut-free) and a few activities (sports and cafe hopping, plus a few more) are chips. Anything else can be typed in.

With nothing selected, a city search is the same as before. Choices are saved in the browser and added to the link, for example `?q=Tokyo&diet=vegan&interest=cafe-hopping`. The guide, place search, and video searches receive the same `diet` and `interest` values when those values apply to that search. Cached responses use the full URL, so a vegan Tokyo guide is stored separately from a generic one.

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
