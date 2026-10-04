"use client";

/**
 * /owner/help — a plain-language index of what OpsIQ shows you and where to find it.
 *
 * Every link below points to a page that already exists in the app today. This page describes
 * real, existing functionality only — it never advertises something OpsIQ can't yet do.
 */

import Link from "next/link";
import { PageHeader, PageContainer } from "@/ui/primitives";

interface HelpTopic {
  question: string;
  answer: string;
  linkHref?: string;
  linkLabel?: string;
}

interface HelpSection {
  title: string;
  topics: HelpTopic[];
}

const SECTIONS: HelpSection[] = [
  {
    title: "Getting started",
    topics: [
      {
        question: "Where do I start?",
        answer:
          "Home shows the handful of things that matter most for your business right now — money, customers, and anything that needs your attention.",
        linkHref: "/owner/cockpit",
        linkLabel: "Go to Home",
      },
      {
        question: "How does OpsIQ learn about my business?",
        answer:
          "My Business is the one place you tell OpsIQ about your business and keep its information current — what kind of business it is, and the numbers that drive everything else.",
        linkHref: "/owner/data",
        linkLabel: "Go to My Business",
      },
      {
        question: "I only have a few numbers, not a full set of books. Can I still use this?",
        answer:
          "Yes. Enter what you have first — rough estimates are fine. Revenue, any one cost figure and the cash you have available give you a first read. You can add more detail later (sales breakdown, other costs, money owed to and by you) to make the picture more accurate; nothing is required all at once.",
      },
    ],
  },
  {
    title: "Money",
    topics: [
      {
        question: "Where do I enter or review my numbers?",
        answer:
          "For your first numbers, start in My Business — give OpsIQ a rough picture (revenue, a cost figure and cash) and it shows you a first read straight away. Money is for the full financial detail and for reviewing how your numbers and position have changed over time.",
        linkHref: "/owner/data",
        linkLabel: "Go to My Business",
      },
      {
        question: "What is the Money page for?",
        answer:
          "Money holds every financial field (receivables, payables, loans, stock and more), your saved snapshots and your cash and survival history. If you have not given OpsIQ any numbers yet, Money offers the same quick start as My Business first.",
        linkHref: "/owner/finance",
        linkLabel: "Go to Money",
      },
      {
        question: "What does \"cash survival\" or \"finance diagnosis\" mean?",
        answer:
          "These are OpsIQ's read on whether your cash position can sustain the business, based on the numbers you've entered. If you haven't entered enough numbers yet, OpsIQ tells you that directly instead of guessing.",
      },
    ],
  },
  {
    title: "Customers, Operations, and the rest of your business",
    topics: [
      {
        question: "Where do I see customer, operations, risk, or inventory information?",
        answer:
          "Each has its own page under Business details in the navigation — Customers, Operations, Risk, Compliance, Goals, Inventory, Procurement, and Vendors. My Business links out to each of these for a closer look.",
        linkHref: "/owner/data",
        linkLabel: "Go to My Business",
      },
    ],
  },
  {
    title: "Priorities and Actions",
    topics: [
      {
        question: "What should I do next?",
        answer:
          "Home shows what needs your attention right now and the next governed action for the active business.",
        linkHref: "/owner/cockpit",
        linkLabel: "Go to Home",
      },
      {
        question: "Where do I track tasks I've started?",
        answer:
          "Actions is your execution workspace — tasks in progress, and the standard operating procedures (SOPs) behind them.",
        linkHref: "/owner/tasks",
        linkLabel: "Go to Actions",
      },
    ],
  },
  {
    title: "Starting a new business",
    topics: [
      {
        question: "I want to plan a brand-new business idea, separate from the one I already run. Where do I do that?",
        answer:
          "Starting up is a separate planning space for a new business idea. It never changes or replaces the business you already have set up — you can always come back to it exactly as you left it.",
        linkHref: "/owner/startup",
        linkLabel: "Go to Starting up",
      },
    ],
  },
  {
    title: "Your account",
    topics: [
      {
        question: "Where do I see my account details?",
        answer: "Your email, name, and role are on the Account page.",
        linkHref: "/settings",
        linkLabel: "Go to Account",
      },
      {
        question: "Something is broken or confusing. Who do I tell?",
        answer:
          "Send feedback goes straight to the team building OpsIQ. Every submission is read during the beta.",
        linkHref: "/owner/feedback",
        linkLabel: "Send feedback",
      },
    ],
  },
];

export default function OwnerHelpPage() {
  return (
    <PageContainer narrow data-testid="owner-help-page">
      <div className="mb-8">
        <PageHeader
          title="Help"
          description="Plain-language answers to common questions, and where to go for each part of OpsIQ."
        />
      </div>

      <div className="flex flex-col gap-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold mb-3">{section.title}</h2>
            <div className="flex flex-col gap-4">
              {section.topics.map((topic) => (
                <div key={topic.question} className="rounded-lg border border-border p-4">
                  <p className="text-sm font-medium text-foreground mb-1">{topic.question}</p>
                  <p className="text-sm text-muted-foreground mb-2">{topic.answer}</p>
                  {topic.linkHref && (
                    <Link href={topic.linkHref} className="text-sm font-medium text-primary hover:underline">
                      {topic.linkLabel} →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageContainer>
  );
}
