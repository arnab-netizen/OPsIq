# Publishing an OpsIQ resource

The owned resource surface lives at `https://opsiq.solutions/resources`. Each
resource is **one Markdown file**. Adding the file is the entire publishing
step: its page (`/resources/<slug>`), its entry on the index, and its
`sitemap.xml` entry are all generated from it. No route, registry, sitemap, or
metadata code changes per article.

| Piece | Where |
| --- | --- |
| Content files | `content/resources/<slug>.md` |
| Social / body images | `public/resources/<file>.png` (or `.jpg`, `.jpeg`, `.webp`) |
| Parser + validation | `src/domain/resources/resource-content.ts` |
| Loading, draft policy | `src/services/resources/resource-repository.ts` |
| Metadata, canonical, JSON-LD | `src/services/resources/resource-seo.ts` |
| Sitemap | `src/services/public-site/sitemap.ts` |
| Renderer | `src/components/resources/ResourceBody.tsx` |

## Workflow

1. **Create** `content/resources/<slug>.md`. The filename is the slug: lowercase
   kebab-case (`profitable-but-short-on-cash.md` → `/resources/profitable-but-short-on-cash`).
2. **Frontmatter** (all keys other than `updatedAt`, `ogImage`, `ogImageAlt` are required; unknown keys fail validation):

   ```
   ---
   title: "Profitable but Short on Cash? How to Tell Which Problem You Actually Have"
   description: 50–200 characters; used for the meta description, social cards, and the index summary.
   publishedAt: 2026-10-01
   updatedAt: 2026-10-15
   author: OpsIQ
   authorType: organization
   status: draft
   ogImage: /resources/profitable-but-short-on-cash.png
   ogImageAlt: "Describe what the social image shows."
   ---
   ```

   - Dates are `YYYY-MM-DD`. A `published` resource may not have a future
     `publishedAt`. Set `updatedAt` only for a real content change — it becomes the
     sitemap `lastmod` and the JSON-LD `dateModified`.
   - `authorType` is `person` or `organization` (controls the JSON-LD author type).
   - `ogImage` (1200×630 recommended) must exist under `public/`; `ogImage` and
     `ogImageAlt` go together. Without them the site's default social image is used.
3. **Body** (the page title is the H1 — start sections at `##`):

   | Syntax | Renders |
   | --- | --- |
   | `## Heading` / `### Heading` | section headings with anchor ids |
   | blank-line-separated lines | paragraphs |
   | `**bold**`, `*italic*`, `` `code` ``, `[text](href)` | inline formatting; links must be `https://`, `/path`, `#anchor`, or `mailto:` |
   | `- item` / `1. item` | bullet / numbered lists (one line per item) |
   | `- [ ] item` / `- [x] item` | checklist |
   | `Table: Caption` then a pipe table | captioned table; `---:` right-aligns (use for numbers) |
   | `> text` | blockquote |
   | `:::note` … `:::` / `:::disclaimer` … `:::` | callouts |
   | `:::cta` (first line = heading, then text) `:::` | inline "Request beta access" panel (the existing beta modal) |
   | `![alt text](/resources/image.png)` | image on its own line |
   | `---` | horizontal rule |

   Anything else (raw HTML, `#` H1, `####`, nested/indented lists, code fences,
   tables without a caption) is rejected with a line number. Escape literal
   `*`, `[`, `]` as `\*`, `\[`, `\]`. Every page automatically ends with the
   standard beta-access CTA.
4. **Validate**: `npx vitest run src/__tests__/resources` — the repository test
   loads every file in `content/resources` and fails on any error. `npm run build`
   runs the same validation.
5. **Preview**: keep `status: draft` and push the branch. Drafts render (with
   `noindex` and a "Draft" label) only on Vercel **preview** deployments, or
   locally with `RESOURCES_INCLUDE_DRAFTS=true npm run build && npm start`. Drafts
   never render on production and never enter `sitemap.xml`.
6. **Publish**: set `status: published`, confirm `publishedAt`, open the PR, get CI
   green, merge. The production deployment adds the page, the index entry, and the
   sitemap entry automatically.
7. **Verify in production**: page returns 200, canonical is
   `https://opsiq.solutions/resources/<slug>`, it is listed on `/resources` and in
   `/sitemap.xml`, and the social card resolves.

## Attribution

Beta requests record first-touch `utm_*` tags, landing path, and external referrer
hostname for the visitor's tab, plus the path the request was submitted from
(`src/lib/attribution/acquisition-attribution.ts`). Tag distribution links, e.g.
`https://opsiq.solutions/resources/<slug>?utm_source=linkedin&utm_medium=social&utm_campaign=<campaign>`.
Canonical URLs never include query strings. Results are visible to beta-request
operators at `/admin/beta-requests`.
