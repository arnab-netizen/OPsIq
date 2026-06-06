# Rebilix — Screenshot & Demo Plan

> Planning only — **do not generate images/video here.** This is the exact shot list and script to
> capture against the live production app (`https://o-ps-iq.vercel.app`). Use a throwaway demo account
> (e.g. `opsiq-demo+<date>@example.com`) and realistic-but-fake business numbers. Never show real
> customer data, secrets, or anything implying payment.

## Capture setup
- Browser: clean window, no extensions/bookmarks bar, 1440×900 (desktop) + a 390×844 mobile pass.
- Light theme; hide personal browser chrome.
- Use the same demo business across shots so the narrative is continuous.
- Redact nothing real — all inputs are fictional.

## Screenshot list (in order)
1. **Public landing (`/`, logged out)** — hero "Diagnose your business. Know your next move.", the
   free-beta badge ("Free beta · no credit card required"), and both CTAs (Start free / Sign in).
   *Purpose: first impression + immediately shows free beta.*
2. **Signup (`/signup`)** — the email / password / workspace-name form. *Purpose: proves a 30-second,
   no-card signup.*
3. **First diagnosis input (`/diagnosis`)** — the form filled with the demo business (name, type, main
   issue, problem statement, optional revenue/costs). *Purpose: shows how little is needed to start.*
4. **Diagnosis result / dashboard** — the result view with the **severity badge**, intervention phase,
   and findings. *Purpose: the "aha" — a structured read, not prose.*
5. **Recommendation / next action** — the action-plan section showing a prioritized action with its
   **owner role, due window, and success metric**. *Purpose: proves it ends in a concrete next move.*
6. **Proof that no payment is required** — a composite/callout: the landing free-beta badge + the fact
   that the entire path (signup → diagnosis → result) was completed with no payment screen. Optionally
   include the support doc line "Billing / payment support: Not applicable during beta."
   *Purpose: removes the #1 launch-day objection.*

Optional extras:
- Mobile shot of the landing + a diagnosis result (responsive proof).
- A clean shot of an empty dashboard with the "run your first diagnosis" path, if used in onboarding copy.

## 60–90 second demo video script

**Target length:** 75s. **Tone:** calm, operator-to-operator, no hype. **No voice required** (captions
work), but a short VO is fine.

| Time | On screen | Caption / VO |
|---|---|---|
| 0:00–0:08 | Landing page (`/`) | "This is Rebilix. You describe your business — it tells you what's actually wrong and what to do next." |
| 0:08–0:14 | Zoom the free-beta badge + CTAs | "Free beta. No credit card. No AI key. Let's run a real diagnosis." |
| 0:14–0:24 | Click **Start free** → signup form fills | "Sign up takes about thirty seconds — email, password, workspace name. No payment, ever, during beta." |
| 0:24–0:40 | Diagnosis form filling in | "Now I describe the business: type, the main issue, a short problem statement, and a couple of numbers. That's it." |
| 0:40–0:55 | Submit → result view (severity + phase + findings) | "Rebilix returns a governed diagnosis — a severity read, the intervention phase you're really in, and the specific findings behind it. It's deterministic: same inputs, same answer. No chatbot guesswork." |
| 0:55–1:08 | Scroll to action plan | "And it ends where advice usually doesn't — a prioritized action plan. Every action has an owner, a due window, and the metric it should move." |
| 1:08–1:15 | Back to landing / badge | "Free beta, live today. Diagnose your business, know your next move. We'd love your feedback." |

**Do/don't for the video**
- ✅ Use fictional data; ✅ show the real product; ✅ keep the free-beta message twice (start + end).
- ❌ No payment/upgrade screens; ❌ no mention of Stripe/Lemon Squeezy; ❌ no claims of integrations,
  team collaboration, or AI features that aren't live.
