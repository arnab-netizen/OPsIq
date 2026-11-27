import type { AgencyToolId } from "@/services/tools/agency/registry";

/**
 * Original explanatory content for each calculator page. Written for owners and operators of small agencies.
 * No invented benchmarks, search-volume claims or superlatives. Where a published figure is quoted it carries its source,
 * year, sample and limitations. The worked example on each page is generated from the engine at render time, so the
 * numbers shown can never drift from what the calculator computes.
 */
export type ToolContent = {
  intro: string;
  definitions: ReadonlyArray<{ term: string; meaning: string }>;
  formulas: ReadonlyArray<string>;
  faq: ReadonlyArray<{ question: string; answer: string }>;
  limitations: ReadonlyArray<string>;
  /** Optional cited context. Must include source, year, sample and a limitation. */
  citedContext?: string;
};

export const RESOURCE_TITLES: Record<string, string> = {
  "agency-utilization-rate-denominator": "Agency Utilization Rate: Pick the Denominator Before You Compare the Number",
  "hours-logged-vs-hours-scoped-overservicing": "Hours Logged vs Hours Scoped: How to Spot Overservicing Before It Eats Your Margin",
  "which-agency-number-to-fix-first": "Which Agency Number Should You Fix First?",
};

export const TOOL_CONTENT: Record<AgencyToolId, ToolContent> = {
  "client-profitability": {
    intro:
      "Revenue ranks clients by invoice size, but invoice size says little about what a client leaves you after the work is done. Enter one client's revenue, the pass-through costs inside it, the delivery hours and costs, and see delivery profit, delivery margin and what each hour of delivery effectively earns.",
    definitions: [
      { term: "Agency gross income (AGI)", meaning: "Client revenue minus pass-through expenses such as media spend billed at cost. It is the money the agency itself earns from the work." },
      { term: "Direct delivery cost", meaning: "The cost of the people and tools used to deliver this client's work: hours multiplied by loaded cost per hour, plus other costs used only for this client." },
      { term: "Loaded cost per hour", meaning: "Salary plus employer costs such as taxes and benefits, divided by paid hours. It is what an hour costs you, not what you charge." },
      { term: "Delivery profit and delivery margin", meaning: "AGI minus direct delivery cost, and that amount as a share of AGI. This is before overhead, so it is not net operating profit." },
      { term: "Effective earned hourly rate", meaning: "AGI divided by delivery hours. It shows what each hour of delivery actually earned after pass-through is removed." },
    ],
    formulas: [
      "AGI = client revenue − pass-through expenses",
      "Direct delivery cost = (hours × loaded cost per hour, for each role) + other direct delivery costs",
      "Delivery profit = AGI − direct delivery cost",
      "Delivery margin = delivery profit ÷ AGI",
      "Required AGI at a target margin = direct delivery cost ÷ (1 − target margin)",
    ],
    faq: [
      { question: "Is delivery margin the same as profit margin?", answer: "No. Delivery margin only subtracts the direct cost of serving the client. Overhead such as rent, management, sales and software still has to be paid from delivery profit, so a healthy delivery margin can sit alongside a loss for the whole agency." },
      { question: "Why remove pass-through expenses from revenue?", answer: "Pass-through amounts pass straight through to a supplier and are not earned by the agency. Leaving them in revenue makes every margin look better than it is. Enter them once, in the pass-through box, and do not enter them again as delivery costs." },
      { question: "Which target margin should I use?", answer: "There is no number that suits every agency. A useful target works backwards from your overhead and the operating profit you want. The calculator takes your own target and does not present it as a benchmark." },
      { question: "What if a client has more than one team working on it?", answer: "Use the second role line for a specialist team, or enter a blended number of hours and a blended loaded cost per hour in the first line." },
    ],
    limitations: [
      "One period for one client. A single month can mislead if hours or billing are lumpy, so compare several periods.",
      "Hours must come from your time tracking. Estimated hours usually understate the real number.",
      "The result is arithmetic on the numbers you enter. It does not know about contract terms, collections or client value beyond revenue.",
    ],
  },
  "retainer-pricing": {
    intro:
      "A retainer that looks fair on signing can lose money once the hours add up. Enter the hours you expect to deliver, what an hour costs you and your target delivery margin to get the fee that covers delivery cost, the fee that reaches your target, and the invoice including pass-through.",
    definitions: [
      { term: "Delivery break-even fee", meaning: "The agency fee at which delivery cost is exactly covered. It is not whole-agency break-even, which must also cover overhead." },
      { term: "Target agency fee", meaning: "The monthly agency fee that delivers your target delivery margin on the hours and costs you entered." },
      { term: "Client invoice", meaning: "The agency fee plus pass-through amounts billed at cost. Pass-through is not part of the fee or the margin." },
      { term: "Contribution", meaning: "The agency fee minus delivery cost: what the retainer leaves toward overhead and profit." },
      { term: "Maximum sustainable hours", meaning: "For a fee you are considering, the delivery hours it can fund at your target margin after other direct costs." },
    ],
    formulas: [
      "Monthly delivery cost = hours × loaded cost per hour + other direct monthly costs",
      "Delivery break-even fee = monthly delivery cost",
      "Target agency fee = delivery cost ÷ (1 − target delivery margin)",
      "Client invoice = agency fee + pass-through amounts",
      "Maximum sustainable hours = (fee × (1 − target margin) − other direct costs) ÷ loaded cost per hour",
    ],
    faq: [
      { question: "Is the break-even fee my agency's break-even?", answer: "No. It only covers delivery cost. The agency also pays for overhead, so pricing at delivery break-even leaves the agency out of pocket." },
      { question: "Why does a 50% margin need double the cost, not 50% on top?", answer: "Margin is measured against the fee, not the cost. A cost of 2,500 needs a fee of 2,500 ÷ (1 − 0.5) = 5,000 for a 50% margin. Adding 50% to cost gives 3,750 and only a 33% margin." },
      { question: "Should pass-through costs be in the fee?", answer: "Keep them separate. They are billed at cost and shown as their own line so the agency's margin is measured on what the agency earns." },
      { question: "What if the client uses more hours than planned?", answer: "Then the real margin is lower than the target. The scope creep calculator shows the effect, and a change-order price or an hours cap protects the retainer." },
    ],
    limitations: [
      "The result depends on the hours estimate. Check it against actual hours logged on similar retainers before quoting.",
      "It prices delivery cost only. Sales effort, account management time that you do not track, and client risk are not included unless you add them to the hours or costs.",
      "A price that works on paper still has to be acceptable to the client. The calculator does not test the market.",
    ],
  },
  utilization: {
    intro:
      "Two agencies can report different utilization for the same team and the same work, because they divide by different hours. This calculator shows utilization against paid capacity and against available capacity side by side, so you can see which denominator a number uses before you compare it to anything.",
    definitions: [
      { term: "Paid capacity", meaning: "Team members multiplied by the hours you pay each of them for in the period." },
      { term: "Available capacity", meaning: "Paid capacity minus leave and holiday hours: the hours people could actually work." },
      { term: "Delivery hours", meaning: "Hours spent on revenue-generating client work. This is not the same as hours invoiced." },
      { term: "Target delivery hours", meaning: "Your target utilization multiplied by available capacity." },
    ],
    formulas: [
      "Paid capacity = team members × paid hours per person",
      "Available capacity = team members × (paid hours − leave and holiday hours) per person",
      "Paid utilization = delivery hours ÷ paid capacity",
      "Available utilization = delivery hours ÷ available capacity",
      "Target delivery hours = target utilization × available capacity",
    ],
    faq: [
      { question: "Which denominator should I use?", answer: "Whichever you choose, state it and use the same one every time. Available capacity is closer to what the team could deliver; paid capacity is closer to what you pay for. Compare your figure only with a benchmark that uses the same denominator." },
      { question: "Is higher utilization always better?", answer: "No. Sales, training, internal work and rest all need time. Sustained very high utilization often shows up later as errors and turnover, which is why 100% is not offered as a target." },
      { question: "Is utilization the same as realization?", answer: "No. Utilization compares delivery hours with capacity. Realization compares hours invoiced with hours delivered. This tool covers utilization only." },
      { question: "Can I sell the spare hours?", answer: "Only if there is demand. The conditional revenue figure shows what spare capacity would be worth if sold at your earned rate; it is not a forecast." },
    ],
    limitations: [
      "Averages hide differences between people and disciplines. A busy designer and an idle developer average out to a comfortable number.",
      "The hours must come from time tracking for the same period as the capacity figures.",
      "It does not know which hours were genuinely revenue-generating unless you decide that when you enter them.",
    ],
    citedContext:
      "For context only, not a target: in AgencyAnalytics' 2026 Marketing Agency Benchmarks Report (a vendor survey of 494 agency professionals, fielded in early 2026, 64% US-based), 50% of the 211 owners and leaders who answered said 60% to 79% of their team's time goes to billable work. The figures are self-reported, the survey does not define \"billable time\" the way this calculator defines delivery hours, and the sample is not representative of all agencies.",
  },
  "scope-creep": {
    intro:
      "Scope creep rarely shows up on an invoice. The fee stays the same while the hours grow, and the margin shrinks quietly. Enter the agreed fee, planned and extra hours, and any approved change order to see how far delivery margin fell, what you absorbed, and what a change order would need to charge.",
    definitions: [
      { term: "Additional unpriced hours", meaning: "Delivery hours beyond the plan that were not agreed to be paid for." },
      { term: "Margin erosion", meaning: "The fall in delivery margin from the original plan to the revised position, in percentage points." },
      { term: "Absorbed cost", meaning: "Extra delivery cost that was not matched by extra revenue. It equals the delivery profit lost." },
      { term: "Hypothetical fee to preserve the margin", meaning: "The additional fee that would have kept the original margin percentage. A what-if, not money that was ever invoiced." },
    ],
    formulas: [
      "Original delivery profit = agreed fee − (planned hours × cost per hour + planned expenses)",
      "Revised delivery profit = (agreed fee + change orders) − (all hours × cost per hour + all direct expenses)",
      "Margin erosion = original delivery margin − revised delivery margin",
      "Absorbed cost = extra hours × cost per hour + extra expenses − change-order revenue",
      "Change-order price = extra cost ÷ (1 − chosen margin)",
    ],
    faq: [
      { question: "Why are absorbed cost and lost profit shown as the same number?", answer: "Because they are. Extra cost not matched by revenue is exactly the delivery profit you did not keep. They describe one event, so adding them together would count it twice." },
      { question: "Is the hypothetical fee revenue I lost?", answer: "No. It is a calculation of what a fee would have to be to hold the original margin. The client never agreed to it, so it is a pricing reference, not a loss." },
      { question: "How should I price a change order?", answer: "Start from the extra delivery cost and divide by one minus the margin you want. The calculator shows this at the margin you choose." },
      { question: "Can some extra work be worth doing for free?", answer: "Sometimes, for example to keep a strategic client. The calculator shows what it costs so the choice is made knowingly." },
    ],
    limitations: [
      "It measures delivery cost and margin only, not the relationship value of the client.",
      "The extra hours must come from time tracking; remembered hours are usually lower than real ones.",
      "It describes one project or period. Repeat it per client to find where scope creep concentrates.",
    ],
  },
  "hourly-rate": {
    intro:
      "A rate that feels right is not the same as a rate that covers your costs. Enter payroll, overhead, delivery capacity, target utilization and the operating margin you want, and see the earned hourly rate the agency needs to break even and to hit that margin, plus how sensitive it is to utilization and cost.",
    definitions: [
      { term: "Earned average hourly rate", meaning: "Agency gross income divided by billable delivery hours. It is what the agency actually earned per hour, after discounts, fixed-fee work and unbilled time." },
      { term: "Rate card", meaning: "The advertised hourly rate. It is usually higher than the earned rate, because not every hour is billed at card price." },
      { term: "Cost pool", meaning: "Delivery payroll and employer costs plus agency overhead, each counted once." },
      { term: "Billable capacity", meaning: "Available delivery hours multiplied by target utilization, applied once." },
    ],
    formulas: [
      "Cost pool = delivery payroll and employer costs + agency overhead",
      "Billable capacity = available delivery hours × target utilization",
      "Break-even earned rate = cost pool ÷ billable capacity",
      "Required agency income = cost pool ÷ (1 − target operating margin)",
      "Required earned rate = required agency income ÷ billable capacity",
    ],
    faq: [
      { question: "Why is the required rate higher than my break-even rate?", answer: "Break-even only recovers cost. The required rate also earns the operating margin you want, so it has to be higher by that margin." },
      { question: "Should my rate card equal the earned rate?", answer: "Usually it needs to be higher. Discounts, fixed-fee projects and unbilled time pull the earned rate below the card, so a card at the earned rate tends to miss the target." },
      { question: "Why does utilization move the rate so much?", answer: "Costs are fixed while billable hours depend on utilization, so a few points of utilization change the hours you can bill against the same cost pool. The sensitivity table shows the effect." },
      { question: "Is overhead counted twice if I include it in payroll?", answer: "It can be. Put each cost in only one box: delivery payroll in the first, everything else in overhead." },
    ],
    limitations: [
      "It assumes all costs are recovered through billable hours of delivery staff, so pass-through costs are outside it.",
      "It gives one blended rate. Roles with different costs may need different rates.",
      "The utilization and margin are your targets, not facts about your agency, so test the result against what you actually earned last quarter.",
    ],
  },
  capacity: {
    intro:
      "Before you promise delivery to another client, check whether the team has the hours. Enter your delivery staff, available hours, target utilization and committed workload to see remaining capacity or shortfall, how many more clients the team could support, and the full-time equivalents a shortfall represents.",
    definitions: [
      { term: "Target delivery capacity", meaning: "Staff multiplied by available monthly hours and your target utilization: the hours you plan to commit." },
      { term: "Committed workload", meaning: "Hours per month already promised to current clients." },
      { term: "Remaining capacity or shortfall", meaning: "Target capacity minus committed workload. Negative means committed work exceeds your target." },
      { term: "Full-time equivalent (FTE)", meaning: "The hours one person provides at your target utilization, used here to express a shortfall as headcount." },
    ],
    formulas: [
      "Target capacity = staff × available hours per person × target utilization",
      "Remaining capacity = target capacity − committed workload",
      "Additional whole clients = floor(remaining capacity ÷ hours per new client)",
      "FTE short = hours above target capacity ÷ (available hours per person × target utilization)",
    ],
    faq: [
      { question: "Does a shortfall mean I should hire?", answer: "Not by itself. A shortfall in hours says nothing about whether the work is profitable or whether you can fund a hire. Check demand, margin and cash first." },
      { question: "Why pool all staff together?", answer: "To keep it simple. Skills are not interchangeable, so for a real decision run it separately for each team or discipline." },
      { question: "Where do I get hours per new client?", answer: "From time tracking on similar clients, using actual hours rather than the hours quoted." },
      { question: "Why a target below 100%?", answer: "Teams need time for internal work and variation. A plan that commits every hour has no slack for problems." },
    ],
    limitations: [
      "Pooled capacity hides skill gaps: spare design time does not cover missing paid-media time.",
      "It uses averages for workload per client. Real workloads vary by month and by client.",
      "It reports hours and FTEs only. It does not recommend hiring, subcontracting or declining work.",
    ],
  },
};
