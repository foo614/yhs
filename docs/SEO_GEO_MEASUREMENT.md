# SEO and GEO measurement

This document separates technical discovery from search ranking, answer-engine citation, and qualified sales outcomes. A successful deployment proves only that public signals are available to crawlers; it does not prove ranking or citation.

## Public content guardrails

- Answer the buyer's question before introducing the dealership.
- Use `YS HENG AUTOMOTIVE SDN BHD` naturally when establishing the entity, and associate the business with Kluang, Johor, Malaysia only where the source supports it.
- Publish inventory, services, prices, reviews, hours, policies, and business attributes only when they are backed by the public system or verified business information.
- Omit unknown vehicle facts instead of inferring mileage, condition, location, warranty, service history, financing availability, or trade-in value.
- Keep structured data aligned with facts visible on the same page.
- Use current primary sources for Malaysian financing, inspection, and ownership-transfer guidance, and show a review date on content that can change.
- Treat helpful, accurate buyer information as the goal. Rankings and answer-engine citations are outcomes to measure, not claims to promise.

## Public discovery check

Run the credential-free check after each public deployment:

```powershell
./infra/verify-public-discovery.ps1
```

The check verifies:

- The home page returns successfully with a canonical, Open Graph metadata, and `AutoDealer` structured data.
- The home page visibly names `YS HENG AUTOMOTIVE SDN BHD` and does not publish the removed unsupported `500+ Reviews` claim.
- The contact page visibly publishes the official business identity and does not publish an unsupported review count.
- `robots.txt` permits discovery by `OAI-SearchBot` and references the production sitemap.
- The sitemap contains the home, inventory, contact, and local buyer-guide routes.
- Each local buyer guide returns successfully with a canonical plus visible FAQs, breadcrumbs, a review date, and matching `WebPage`, `FAQPage`, and `BreadcrumbList` structured data.

Use `-SkipGuidePages` only when checking a deployment from before the local guide routes were released.

## Baseline recorded 2026-08-12

| Signal | Baseline | Evidence or limitation |
| --- | --- | --- |
| Production home | Available | `https://ysheng.com.my/` returned HTTP 200. |
| Robots and sitemap | Available | Both public routes returned HTTP 200; `OAI-SearchBot` was allowed. |
| Branded social preview | Available | Static 1200 x 630 PNG and Open Graph dimensions/type were live. |
| Public web search for `site:ysheng.com.my "used cars in Kluang"` | Not observed | The sampled search returned no YS Heng result. |
| Branded public web search | Partial external presence | A YS Heng Linktree result appeared; the official website was not observed in the sampled results. |
| Generic `used cars Kluang` visibility | Not observed for YS Heng | The sampled results were led by established marketplaces/directories. |
| Google Search Console impressions and clicks | Unavailable | Requires access to the verified Search Console property. |
| Bing Webmaster impressions and clicks | Unavailable | Requires access to the verified Bing Webmaster property. |
| ChatGPT or other answer-engine citations | Not observed in this baseline | Citation availability varies by engine, query, location, and crawl timing; absence must be recorded honestly. |
| Qualified organic and AI-referred enquiries | Unavailable | Requires analytics or lead-source reporting; no customer or secret analytics data belongs in this file. |

## Fixed monthly query set

Run the same queries from the same locale when practical and record the date, engine, whether YS Heng was cited, whether `ysheng.com.my` was linked, and whether the business facts were accurate.

- `used cars in Kluang`
- `used car dealer in Kluang Johor`
- `used cars under RM30000 in Kluang`
- `used car loan assistance in Kluang`
- `trade in car in Kluang`
- `YS Heng Automotive Kluang`

Do not treat one personalized result as a trend. Preserve screenshots or exported reports outside the repository when they contain account or customer data.

## Monthly scorecard

| Metric | Source | Current month | Previous month | Notes |
| --- | --- | --- | --- | --- |
| Valid indexed pages | Google Search Console |  |  |  |
| Search impressions | Google Search Console |  |  |  |
| Search clicks | Google Search Console |  |  |  |
| Branded-query impressions | Google Search Console |  |  |  |
| Bing impressions and clicks | Bing Webmaster Tools |  |  |  |
| ChatGPT referral sessions | Privacy-approved analytics |  |  |  |
| Other AI referral sessions | Privacy-approved analytics |  |  |  |
| Qualified organic enquiries | Existing lead attribution |  |  |  |
| Fixed prompts citing YS Heng | Manual prompt set |  |  | Record as count out of six. |
| Citations with factual errors | Manual prompt set |  |  | List corrections required. |

## Interpretation

- Technical checks can pass immediately after deployment.
- Indexing usually changes after crawler revisit; record the actual inspection date instead of assuming a fixed delay.
- Ranking and answer-engine citation require relevant content plus corroborating external trust signals and may take weeks or longer.
- A citation without a link, a wrong address, stale stock, or an invented review is not a successful GEO outcome.
- The business outcome is qualified enquiries, not raw impressions alone.

## External account checklist

These actions require the business owner or an authorized account holder:

- Verify the `https://ysheng.com.my/` property in Google Search Console and submit `/sitemap.xml`.
- Verify the site in Bing Webmaster Tools and submit the same sitemap.
- Confirm that Google Business Profile uses the same legal/brand name, address, phone, website, and verified opening hours as the public website.
- Add opening hours to website structured data only after the business confirms the exact schedule and holiday process.
- Request genuine customer reviews without supplying identical wording or offering misleading incentives.
