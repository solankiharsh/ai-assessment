# ADR 006: SEC.gov fetching strategy

## Status

Accepted.

## Context

The pipeline fetches URLs from many domains. SEC.gov is critical for filings and litigation documents but enforces strict access rules. Without a compliant User-Agent (including contact information), SEC returns 403 for both direct page requests and the EDGAR Full-Text Search (EFTS) API. In addition, litigation complaint PDFs live under `/litigation/` and are not indexed by EFTS, which only covers EDGAR filing text. We need a clear strategy for Tier 1/2/3 when targeting sec.gov.

## Decision

1. **SEC User-Agent policy**  
   SEC [requires](https://www.sec.gov/os/accessing-edgar-data) a descriptive User-Agent that includes contact information (e.g. company name and email). We use a single identity for all sec.gov traffic: `DeepResearchAgent/1.0 {email}` where `email` is read from configuration. This is applied to:
   - **Tier 1 (WebFetcher)**: For any URL whose host contains `sec.gov`, we override the rotated browser User-Agent with this SEC-compliant value.
   - **Tier 3 (EDGAR EFTS)**: All EFTS requests use the same User-Agent so the API does not block us.

2. **EFTS scope**  
   EFTS indexes EDGAR filing text (e.g. `/edgar/data/...` by CIK), not litigation PDFs under `/litigation/`. We therefore:
   - Treat URLs whose path contains `/litigation/` as out of scope for EFTS.
   - In Tier 3, if the URL is a sec.gov litigation URL we skip EFTS and return `inaccessible_reason="sec_litigation_not_in_efts"` so the pipeline can fall through to Tier 4 (Wayback) or treat as inaccessible without wasting EFTS calls.

3. **PDF extraction (Tier 2)**  
   For PDF URLs (including sec.gov litigation PDFs), Tier 2 uses the browser context’s `request.get` to fetch the PDF bytes. When **pymupdf** (fitz) is installed we extract text from the PDF and return it in a `FetchResult`, so downstream steps get searchable text instead of a dead end. For sec.gov PDFs we create the Playwright context with the SEC User-Agent so the request is compliant. If pymupdf is not available we continue to return `pdf_no_text_extraction` and rely on Tier 3/4 or indirect search.

4. **Indirect search fallback**  
   When a URL remains inaccessible after all tiers (e.g. litigation PDF with no Wayback snapshot), the pragmatic fallback is **indirect search**: use Tavily/Brave snippets and existing search results that reference the same case or filing. We do not add a special “search by filename” path for litigation; the existing search flow already surfaces related content.

5. **Configuration**  
   The contact email used in the SEC User-Agent is set via **`SEC_CONTACT_EMAIL`** (env) / `SearchConfig.sec_contact_email`, with a default of `research@example.com`. Deployments must set this to a valid contact for SEC compliance.

6. **Optional crawl4ai tier (Tier 2.5)**  
   When **crawl4ai** is installed (`pip install -e ".[fetch-crawl4ai]"`) and **`USE_CRAWL4AI_FETCH=true`**, an optional Tier 2.5 runs after Playwright (Tier 2) for URLs on regulatory domains (sec.gov, finra.org, dfpi.ca.gov). It uses `AsyncWebCrawler` with the SEC User-Agent for sec.gov and a short timeout. This can improve success on some regulatory pages where Playwright fails. The primary strategy (SEC UA, EFTS scope, Playwright + PyMuPDF for PDFs) remains unchanged; crawl4ai is an additive option.

## Consequences

- **Pros**: Compliant sec.gov access reduces 403s; EFTS is only used where it can return results; PDF text extraction improves utility of Tier 2 for SEC and other PDFs; one env var keeps SEC identity explicit and configurable.
- **Cons**: Litigation PDFs that are not in Wayback and fail to fetch in Tier 2 depend on indirect search or remain inaccessible; pymupdf is a required dependency for PDF text (optional at runtime only if we keep try/import and fallback).
