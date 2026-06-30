# OpsIQ Public Case Source Register

Metadata only — NO personal identifiers, NO long copied source text. Each record captures a
public real-world business **pattern** reused (anonymized) by the real-world case library.

Validation: PASS (schema + unique ids + no-PII + no-long-text). Records: 20.

| Source ID | Type | Category | Geo | Reliability | Completeness | Anonymization | Privacy risk | Reference |
|---|---|---|---|---|---|---|---|---|
| SRC-SCORE-CASHFLOW | gov_sme_guidance | retail/grocery | US | high | medium | no_personal_data | low | [link](https://www.score.org/resource/blog-post/1-reason-small-businesses-fail-and-how-avoid-it) |
| SRC-FC-BREWBURST | failure_postmortem | restaurant/cafe/cloud-kitchen | global | medium | high | anonymized | low | [link](https://fastercapital.com/content/Business-failure--Learning-from-Business-Failures--Case-Studies-and-Insights.html) |
| SRC-FC-URBANMART | failure_postmortem | retail/grocery | global | medium | high | anonymized | low | [link](https://fastercapital.com/content/Business-failure--Learning-from-Business-Failures--Case-Studies-and-Insights.html) |
| SRC-PESHEV-EXPANSION | failure_postmortem | restaurant/cafe/cloud-kitchen | global | medium | medium | no_personal_data | low | [link](https://mariopeshev.com/business-failure-lessons/) |
| SRC-KENAN-RESILIENCE | sector_example | local-agency/professional-services | US | high | medium | no_personal_data | low | [link](https://kenaninstitute.unc.edu/kenan-insight/lessons-on-small-business-resilience-from-the-global-pandemic/) |
| SRC-SCIENCEDIRECT-COVID | regulatory_summary | hotel/guesthouse | global | high | medium | no_personal_data | low | [link](https://www.sciencedirect.com/science/article/pii/S221242092400013X) |
| SRC-CEINTERIM-TURNAROUND | turnaround_story | small-manufacturing | EU | medium | medium | no_personal_data | low | [link](https://ceinterim.com/business-turnaround-case-study-success-stories/) |
| SRC-FOUNDR-STARTUP | case_study | micro-SaaS | US | medium | medium | no_personal_data | low | [link](https://foundr.com/articles/leadership/personal-growth/4-startup-case-studies-failure) |
| SRC-TAL-FAKEVENDOR | case_study | housekeeping/cleaning | US | high | high | anonymized | low | [link](https://talglobal.com/knowledge-center/fraud-investigation-case-study/) |
| SRC-SDK-FICTITIOUS-VENDOR | case_study | B2B-service-contractor | US | medium | high | anonymized | low | [link](https://sdkcpa.com/exploring-a-fictional-case-of-employee-fraud/) |
| SRC-PAPAYA-GHOST | staffing_ops | housekeeping/cleaning | global | medium | medium | no_personal_data | low | [link](https://www.papayaglobal.com/blog/ghost-employee-fraud-detection-and-strategies/) |
| SRC-BND-FRAUD-SIGNS | advice_forum | auto-service/repair-parts | US | medium | medium | no_personal_data | low | [link](https://www.businessnewsdaily.com/11164-how-to-spot-employee-fraud.html) |
| SRC-SBA-RECEIVABLES | gov_sme_guidance | import/export/wholesale | US | high | low | no_personal_data | low | U.S. Small Business Administration — managing cash flow and receivables (sba.gov guidance) |
| SRC-SOCIALTARGETER-PIVOT | failure_postmortem | retail/grocery | global | medium | medium | no_personal_data | low | [link](https://www.socialtargeter.com/blogs/case-studies-of-failures-analyzing-business-strategies-that-missed-the-mark) |
| SRC-FORTUNE-RANSOMWARE | cyber_continuity | small-manufacturing | US | high | high | no_personal_data | low | [link](https://fortune.com/2026/04/16/small-business-owner-hidden-tax-cyber-ransomware-131-billion/) |
| SRC-EQUILIBRIUM-SME-RANSOM | cyber_continuity | import_export_wholesale | UK | high | medium | no_personal_data | low | [link](https://equilibrium-security.co.uk/blog/case-study-ransomware-attack-shuts-down-a-9m-sme/) |
| SRC-MARSH-CYBER-INSURANCE | finance_example | clinic_healthcare_service | global | high | low | no_personal_data | low | [link](https://www.marsh.com/en/services/cyber-risk/insights/surviving-a-ransomware-attack.html) |
| SRC-PRICE2SPY-UNDERCUT | business_blog | retail/grocery | global | medium | medium | no_personal_data | low | [link](https://www.price2spy.com/blog/undercutting/) |
| SRC-NETSUITE-DEMAND-SEASON | business_blog | retail/grocery | global | medium | low | no_personal_data | low | [link](https://www.netsuite.com/portal/resource/articles/business-strategy/demand-based-pricing.shtml) |
| SRC-SBA-SUCCESSION-EXIT | gov_sme_guidance | local-agency/professional-services | US | high | low | no_personal_data | low | U.S. Small Business Administration — exit and succession planning guidance (sba.gov) |

## Facts used / inferred / synthetically varied (per source)

### SRC-SCORE-CASHFLOW — SCORE: the #1 reason small businesses fail (cash flow)
- **Facts used:** A large share of small businesses fail from cash-flow problems, not lack of profit on paper; Owners must monitor cash, control expenses, and hold reserves
- **Facts inferred:** Profit-on-paper can mask a cash crisis when receivables lag payables

### SRC-FC-BREWBURST — Cafe failure pattern: imported inputs paid upfront, clients on 90-day credit
- **Facts used:** Costly inputs paid upfront while corporate clients took up to 90-day credit; Strong revenue on paper but shrinking day-to-day cash as overheads rose
- **Facts inferred:** Working-capital gap widened until the business could not fund operations

### SRC-FC-URBANMART — Retail failure pattern: overstock, slow-movers, dead stock vs cash
- **Facts used:** Overstocked shelves and slow-moving items led to storage cost, markdowns and lost cash; Failure to balance inventory level against real demand
- **Facts inferred:** Dead stock ties working capital that should fund fast-movers

### SRC-PESHEV-EXPANSION — Failure pattern: rapid expansion without operating-cost control
- **Facts used:** Expanded rapidly without accounting for operating costs and could not cover expenses
- **Facts inferred:** A second site doubled fixed cost before the first proved repeatable unit economics

### SRC-KENAN-RESILIENCE — SMB resilience under a demand shock (pandemic study)
- **Facts used:** Small firms with thin reserves were hit hardest by a sudden demand collapse; Survivors cut discretionary cost fast and protected core cash
- **Facts inferred:** Continuity planning and reserves separate survivors from closures in a shock

### SRC-SCIENCEDIRECT-COVID — Lost income and recovery for small businesses during a shock
- **Facts used:** Revenue dropped sharply during the shock; recovery lagged for cash-thin operators
- **Facts inferred:** Hospitality with high fixed cost needs a staged cost freeze and runway math

### SRC-CEINTERIM-TURNAROUND — Business turnaround pattern: stabilise cash, then fix margin
- **Facts used:** Turnaround sequenced cash stabilisation before margin and growth fixes
- **Facts inferred:** Stop-loss on loss-making lines precedes reinvestment

### SRC-FOUNDR-STARTUP — Startup failure case studies: building without validated demand
- **Facts used:** Products scaled spend before proving retention/unit economics; Burn outran revenue with weak CAC-to-LTV
- **Facts inferred:** A micro-SaaS must prove retention before paid-acquisition scale

### SRC-TAL-FAKEVENDOR — Fake-vendor invoice + kickback scheme detected by audit discrepancy
- **Facts used:** An employee authorised to approve vendor contracts up to a threshold submitted false invoices from a related cleaning vendor and took kickbacks; Detected when auditors noticed irregular payments to an unfamiliar linked vendor
- **Facts inferred:** Independent verification + segregation of vendor approval and payment would have blocked it
- **Facts synthetically varied:** Relocated pattern to a Tier-2 facility-services contractor

### SRC-SDK-FICTITIOUS-VENDOR — Fictitious vendor accounts: invoices with no PO or receiving report
- **Facts used:** Fictitious vendor accounts generated invoices for goods never delivered; Detected via payments lacking matching purchase orders or receiving reports
- **Facts inferred:** Three-way match (PO/receipt/invoice) is the controlling proof gate

### SRC-PAPAYA-GHOST — Ghost-employee payroll fraud detection/prevention
- **Facts used:** Payroll paid 'ghost' employees who do not exist; Independent headcount/attendance reconciliation exposes it
- **Facts inferred:** Owner-verified roster vs payroll is the control for shift-labour businesses

### SRC-BND-FRAUD-SIGNS — Signs of employee fraud and owner detection controls
- **Facts used:** Owner controls: receive bank/card statements directly, sign payments personally, watch lifestyle/behaviour red flags
- **Facts inferred:** Proof gates must not depend on the person being controlled

### SRC-SBA-RECEIVABLES — SBA/SME guidance: receivables, terms and working-capital discipline
- **Facts used:** Tighten credit terms, invoice promptly, and reserve for tax/payroll obligations
- **Facts inferred:** B2B distributors fail on payment-term mismatch, not gross margin

### SRC-SOCIALTARGETER-PIVOT — Failure pattern: ignoring declining foot traffic and online competition
- **Facts used:** A retail operator ignored declining foot traffic and online competition until too late; Lesson: track metrics and pivot when the model breaks
- **Facts inferred:** A stop-loss/pivot trigger on declining same-store demand is required

### SRC-FORTUNE-RANSOMWARE — SMB ransomware: hit in peak season, ~6-figure recovery, paying marks you a repeat target
- **Facts used:** Ransomware encrypted financials, inventory and records in peak season; recovery cost six figures even without paying; Paying marks a business as a repeat target on criminal forums
- **Facts inferred:** Segregated offline backups + incident-response + cyber insurance are the controls; do not pay impulsively

### SRC-EQUILIBRIUM-SME-RANSOM — SME ransomware with no segregated backups: trading halted for weeks
- **Facts used:** Every critical system encrypted within hours; no segregated secure backups; could not trade or process orders; Recovery slow even after a decryption key
- **Facts inferred:** Tested offline backups + a continuity plan are the difference between hours and weeks of downtime

### SRC-MARSH-CYBER-INSURANCE — Cyber/disaster: insurance + incident response + tested backups as the recovery controls
- **Facts used:** Survivors had insurance, an incident-response partner and tested backups; impulsive ransom payment is discouraged
- **Facts inferred:** Insurance-claim readiness + disaster continuity belong in the operating plan, not after the event
- **Facts synthetically varied:** Generalized to fire/flood disaster continuity

### SRC-PRICE2SPY-UNDERCUT — Price war: respond to undercutting by differentiation, not matching below cost
- **Facts used:** Matching a low-cost competitor's price erodes margin long-term; Shift competition to differentiation/benefits rather than price alone
- **Facts inferred:** Do not cut price below fully-loaded cost to win a price war

### SRC-NETSUITE-DEMAND-SEASON — Seasonality/demand planning reduces markdowns and stock-outs
- **Facts used:** Demand planning against seasonality drives inventory/replenishment and cuts markdowns; Short demand-driven cycles beat long-horizon seasonal guesses
- **Facts inferred:** Festival/weather demand spikes need capacity + working-capital planning, not panic buying

### SRC-SBA-SUCCESSION-EXIT — Succession / exit-sale readiness: clean records + reduce key-person dependency
- **Facts used:** Sale/exit value depends on clean financials and reduced key-person dependency; Succession planning de-risks owner/key-person exit
- **Facts inferred:** Weak records + single-point key-person dependency destroy exit value
