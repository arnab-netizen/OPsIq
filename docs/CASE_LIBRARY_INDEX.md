# External Case Study Library Index

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** OPTION-A Phase F  
**Status:** INDEX — 100 documented real-world business failure and recovery cases

---

## 1. Purpose

This library indexes 100 real-world SMB failure and recovery cases drawn from publicly documented business outcomes, regulatory filings, trade press, insolvency records, and management literature. It serves as:

1. A reference corpus for validating OpsIQ root cause coverage
2. A source of pattern evidence supporting simulation case authoring
3. A qualitative benchmark for diagnosis realism

**Anti-tuning rule:** No case in this library may be used to tune the diagnosis engine, modify scoring weights, or adjust output thresholds. This library is observational.

---

## 2. Case Categories

| Code | Category |
|------|----------|
| CF | Cash Flow Failure |
| MG | Margin Erosion |
| DM | Demand / Market Failure |
| GV | Governance / Founder Failure |
| OP | Operational Failure |
| ST | Strategy / Positioning Failure |
| CP | Compliance / Regulatory Failure |
| SC | Supply Chain / Concentration Failure |
| HR | Human Capital / Key Person Failure |
| FN | Financial Structure / Debt Failure |

---

## 3. Case Index

### CF — Cash Flow Failure

| ID | Title | Industry | Primary Root Cause | Outcome |
|----|-------|----------|-------------------|---------|
| CF-001 | Invoice Factoring Dependency Creating Spiral | Trade services | Over-reliance on factoring at 3% monthly fee eliminating margin | Administration |
| CF-002 | Retail Chain Paying Dividends While Insolvent | Retail fashion | Owner drawings and dividends during cash shortfall | Liquidation |
| CF-003 | Construction Firm Milestone Billing Lag | Commercial construction | Progress billing 60 days behind work completed | Near-insolvency; rescue by equity injection |
| CF-004 | Franchise Group Negative Float on Gift Cards | Hospitality | Gift card liabilities exceeding current assets | Restructure |
| CF-005 | Law Firm WIP Not Converted for 18 Months | Professional services | $2.1M WIP unbilled due to partner avoidance of billing conversations | Partnership dissolution |
| CF-006 | Print Business Seasonal Trough Cash Out | Print and signage | December trough with no overdraft facility depleted reserves | Administration |
| CF-007 | Physiotherapy Clinic Bulk-Billing Transition Gap | Allied health | Transition from private billing to bulk billing reduced average receipt by 42% before cost structure adjusted | Near-insolvency |
| CF-008 | Café Operator Paying Suppliers Before Collecting Revenue | Hospitality | 14-day supplier terms; no credit from major suppliers | Insolvency |
| CF-009 | Gym Membership Revenue Front-Loaded, Costs Flat | Fitness | Annual memberships collected upfront; operating costs consumed cash before service delivered | Collapse in year 2 |
| CF-010 | IT Reseller Pre-Ordering Hardware on 30-Day Terms | IT distribution | Pre-orders for customer projects on net-30 supplier terms with net-60 customer terms | $380K cash gap |

---

### MG — Margin Erosion

| ID | Title | Industry | Primary Root Cause | Outcome |
|----|-------|----------|-------------------|---------|
| MG-001 | Cleaning Company Minimum Wage Increases Not Repriced | Commercial cleaning | 3 consecutive minimum wage rises absorbed without client rate review | Margin from 18% to 4% in 3 years |
| MG-002 | Café Franchise Royalty Growth Outpacing Revenue | Hospitality franchise | Revenue flat; royalty and levy base costs grew as fixed percentage | Owner earnings zero in year 4 |
| MG-003 | Printing Company Paper Cost Spike Not Passed Through | Print | Pulp and paper cost doubled; contracts had no escalation clause | Gross margin below viable threshold |
| MG-004 | Electrical Contractor Quoting From Memory | Electrical trades | Labour hour estimates based on memory not job records; 20% underestimation systematic | Cumulative loss on 47 jobs |
| MG-005 | Bakery Wholesale Pricing 8 Years Unchanged | Food manufacturing | Wholesale price list not updated since 2016; input costs up 60% | EBITDA negative |
| MG-006 | IT Managed Services Pricing Frozen During Cloud Migration | IT services | Per-seat price unchanged while delivery cost increased with cloud overhead | Margin erosion from 40% to 9% |
| MG-007 | Landscaping Quoting Without Material Escalation | Landscaping | Fixed-price quotes for 90-day projects without material price adjustment clause | $47K aggregate loss over 8 projects |
| MG-008 | Restaurant Portion Sizes Not Reviewed With Food Cost Rise | Hospitality | Food cost rose 28%; plate cost not reviewed; gross margin compressed | Owner salary eliminated |
| MG-009 | Software Consultancy Scope Creep Absorbed | IT consulting | Scope creep accepted informally; no variation orders raised | Effective hourly rate fell to $45 on $150 contract |
| MG-010 | Auto Mechanic Labour Rate Not Increased for 4 Years | Automotive services | Flat labour rate against rising award wages | Operating loss from year 3 |

---

### DM — Demand / Market Failure

| ID | Title | Industry | Primary Root Cause | Outcome |
|----|-------|----------|-------------------|---------|
| DM-001 | Photography Studio Social Media Algorithm Change | Photography | 90% of enquiries from Instagram; reach fell 70% after algorithm change | Revenue -60% in 6 months |
| DM-002 | Real Estate Agency Referral Network Retired | Real estate | 70% of vendor leads from two retired financial planners | Pipeline collapse |
| DM-003 | Hardware Retailer Outcompeted by National Chain Entry | Retail hardware | National chain opened 2km away; foot traffic -45% in 12 months | Closure |
| DM-004 | Niche Bookshop Addressable Market Shrink | Specialty retail | Target demographic declining population in catchment area | Restructure to online only |
| DM-005 | Restaurant TripAdvisor Star Drop | Hospitality | Kitchen hand turnover affected consistency; 4.2 star to 3.1 star in 6 months | Revenue -35% |
| DM-006 | Wedding Photographer Over-Indexed on One Venue | Photography | 60% of bookings from one venue that changed preferred vendor policy | Revenue halved in 1 year |
| DM-007 | Gym Lost Anchor Corporate Contract | Fitness | One corporate employer account represented 34% of members; employer relocated | 34% member base lost |
| DM-008 | B2B Software Niche Market Saturated | B2B software | Product achieved 80%+ market share in addressable segment; no adjacent market path | Growth plateau then decline |
| DM-009 | Café Pedestrian Footfall Drop After CBD Construction | Hospitality | Streetworks blocked foot entry for 14 months | Revenue -50% during works |
| DM-010 | Mortgage Broker Referral Network Aged Out | Financial services | Referring accountants retired over 3-year period; no replacement pipeline built | Revenue -40% over 3 years |

---

### GV — Governance / Founder Failure

| ID | Title | Industry | Primary Root Cause | Outcome |
|----|-------|----------|-------------------|---------|
| GV-001 | Co-Founder Equity Dispute Mid-Raise | B2B SaaS | Undefined equity split crystallised into dispute when investor required cap table clarity | Raise collapsed; one founder exited |
| GV-002 | Restaurant Partnership Veto Paralysis | Hospitality | Two equal co-owners unable to agree on menu, staffing, or pricing; operational decisions stalled | Partnership dissolved |
| GV-003 | Family Business Succession Tax Not Planned | Family business | Owner death triggered CGT event with no succession structure; family sold under duress | Business sold at below-market price |
| GV-004 | Founder Vesting Cliff Passed; Co-Founder Disengaged | B2B SaaS | Technical co-founder vested 100% at 4 years; no further work incentive; codebase stalled | Product development halted |
| GV-005 | Director Drawings Classified as Loans Then Forgiven | Retail | Recurring director drawings misclassified as loans for 3 years; forgiven on wind-up | Creditor shortfall; liquidator investigated |
| GV-006 | Husband-Wife Business Communication Breakdown | Services | Personal relationship breakdown bled into business governance; staff turnover from caught-between conflict | Business listed for sale |
| GV-007 | Silent Partner Demanding Operational Control | Professional services | Passive investor began asserting management decisions not permitted under shareholder agreement | Partner buy-out required |
| GV-008 | Solo Founder No Succession Plan Before Medical Event | Trades | Sole director and operator hospitalised for 3 months; no authority delegated; business could not operate | Permanent closure |
| GV-009 | Board of One Missing Regulatory Obligation | Manufacturing | Sole director unaware of annual reporting obligations under industry regulator; licence not renewed | Forced cessation of trading |
| GV-010 | Shareholders Agreement Unsigned for 3 Years | B2B software | Founders operated on handshake; dispute arose before agreement signed; no enforcement mechanism | Litigation |

---

### OP — Operational Failure

| ID | Title | Industry | Primary Root Cause | Outcome |
|----|-------|----------|-------------------|---------|
| OP-001 | Plumber Owner-Operator Bottleneck at $800K Revenue | Plumbing | Owner personally on all jobs; could not delegate; revenue ceiling hit | Stagnation at $800K for 4 years |
| OP-002 | Courier Business Driver Churn at 6 Months Average | Courier | Below-market pay rates; systematic 6-month driver turnover; owner covering routes | Owner burnout |
| OP-003 | Hospitality Venue Open Hours Exceeding Owner Energy | Hospitality | 7-day trading for venue with 2 FTE; owner covering 70+ hours; quality collapsed | Revenue decline and owner health event |
| OP-004 | IT Support Firm No Documented Processes | IT services | All client configurations held in one senior technician's head; departure created service failure | Emergency rehire at premium rate |
| OP-005 | Retail Store Inventory Management Spreadsheet Failure | Retail | Manual inventory in spreadsheet with no reconciliation; $85K of phantom stock discovered | Write-off impacted reported profitability |
| OP-006 | Construction Subcontractor No Defect Tracking | Construction | Defects discovered post-handover not tracked; repeat call-backs absorbed 15% of labour | Margin erosion |
| OP-007 | HVAC Technician Scheduling Gaps 30% Unutilised | HVAC | No scheduling system; reactive booking only; 30% of available hours unfilled | Revenue 30% below capacity |
| OP-008 | Cleaning Company QC Failure Leading to Contract Loss | Cleaning | No inspection regime; three major clients terminated consecutively | Revenue -45% in 60 days |
| OP-009 | Café Time-Temperature Log Not Maintained | Hospitality | Food safety audit failed due to temperature log gaps; licence suspended for 10 days | Revenue loss and compliance cost |
| OP-010 | Childcare Centre Ratio Breach Not Caught in Time | Childcare | Staff rostering error caused regulatory ratio breach; four breaches triggered review | Licence conditions imposed |

---

### ST — Strategy / Positioning Failure

| ID | Title | Industry | Primary Root Cause | Outcome |
|----|-------|----------|-------------------|---------|
| ST-001 | Artisan Coffee Roaster Competing on Volume in Commodity Channel | Food manufacturing | Premium roaster entered supermarket channel at commodity price point; brand positioned incorrectly | Margin destruction |
| ST-002 | Legal Services Firm Expanding to New State Without Network | Legal | Interstate office opened without existing referral base; 18 months of fixed costs before first revenue | $420K loss; office closed |
| ST-003 | SaaS Product Built for Problem That Was Not Prevalent | B2B SaaS | Product solved real problem affecting <2% of target segment; TAM too small | Revenue ceiling at $180K ARR |
| ST-004 | Trade Business Repositioning Upmarket Without Skills | Electrical | Marketing repositioned to luxury residential but technical team lacked required skills | Customer complaints; project losses |
| ST-005 | Fashion Retailer Offering Same Product as Online Pure-Plays | Retail fashion | No differentiation from online alternatives; unable to justify retail margin premium | Closure |
| ST-006 | Restaurant Adding Delivery Without Delivery Margin | Hospitality | Third-party delivery added at 30% commission; no price premium for delivery; margin negative on all delivery orders | Delivery volume grew, profitability fell |
| ST-007 | Accounting Firm Refusing to Price Advisory Work | Professional services | Firm culture resistant to advisory billing; left advisory-ready clients underserved | Market share lost to advisory competitors |
| ST-008 | Hardware Retailer Targeting Trade While Trade Volume Shifted to Big Box | Retail hardware | Core trade customer segment moved to national accounts with large distributors | Revenue -30% over 3 years |
| ST-009 | Gym Competing on Price in Market That Had Shifted to Premium | Fitness | Low-cost model in catchment area where 3 premium studios opened; price-sensitive members churned up | Occupancy fell, low-margin member base retained |
| ST-010 | Financial Adviser Practice Not Transitioning to Fee-for-Service Model | Financial services | Trail commission model disrupted by regulation; transition to fee-for-service delayed 2 years | Revenue cliff when regulation effective |

---

### CP — Compliance / Regulatory Failure

| ID | Title | Industry | Primary Root Cause | Outcome |
|----|-------|----------|-------------------|---------|
| CP-001 | Hospitality Group Undisclosed Award Rate Breach | Hospitality | Weekend and public holiday penalties not paid correctly for 3 years; undisclosed at acquisition | $340K remediation liability discovered post-sale |
| CP-002 | Labour Hire Firm Sham Contracting Arrangement | Labour hire | Employees classified as contractors to avoid superannuation; ATO audit triggered $180K liability | ATO audit; penalty; restructure |
| CP-003 | Childcare Operator Licence Condition Breach | Childcare | Mandatory ratio requirements breached under pressure of staff shortage | Licence cancelled |
| CP-004 | Tradesperson Operating Without Required Licence | Electrical | Subcontracted work performed by unlicensed worker; homeowner complaint triggered investigation | Prosecution; $85K fine |
| CP-005 | Food Manufacturer Labelling Non-Compliance | Food manufacturing | Allergen labelling did not meet updated standard; product recall triggered | $120K recall cost; retailer delisted |
| CP-006 | Property Developer Building Code Defect Discovered | Property development | Building inspector identified structural defect post-occupancy; rectification ordered | $650K remediation |
| CP-007 | IT Company Data Breach Notification Failure | IT services | Notifiable data breach not reported within mandated 30-day window | Regulatory investigation; $50K penalty |
| CP-008 | Aged Care Provider Accreditation Standard Failures | Aged care | Multiple accreditation standards not met; surprise audit triggered | Accreditation at risk; government intervention |
| CP-009 | Plumbing Business Superannuation Not Remitted | Plumbing | SGC not remitted for 2 years during cash stress; Director Penalty Notice issued | Personal liability crystallised |
| CP-010 | Manufacturing Business WorkSafe Improvement Notices | Manufacturing | Three WorkSafe improvement notices unresolved; prohibition notice issued; production halted | 4-week shutdown |

---

### SC — Supply Chain / Concentration Failure

| ID | Title | Industry | Primary Root Cause | Outcome |
|----|-------|----------|-------------------|---------|
| SC-001 | Industrial Distributor Single-Supplier Concentration | Industrial supply | 80% of product sourced from one manufacturer; manufacturer ceased trading | $280K inventory gap; client contracts at risk |
| SC-002 | Food Manufacturer Seasonal Ingredient Failure | Food manufacturing | Key seasonal ingredient sourced from one region; crop failure in that region | Production halt; $90K in lost orders |
| SC-003 | Construction Subcontractor Key Supplier Price Rise 40% | Construction | Steel supplier raised prices 40% post-contract signing; no escalation clause | $120K absorbed on fixed-price contracts |
| SC-004 | Retail Importer Single-Country Sourcing Disruption | Retail import | All product sourced from one country; logistics disruption created 4-month delivery gap | Stockout; competitor gained shelf space |
| SC-005 | IT Reseller Distributor Changed Credit Terms | IT distribution | Primary distributor reduced credit terms from 60 to 14 days without notice | $200K immediate cash requirement |
| SC-006 | Café Espresso Bean Supplier Ceased Trading | Hospitality | Sole quality espresso bean supplier went into administration | 3-week product quality disruption during transition |
| SC-007 | Auto Parts Retailer Counterfeit Product Recall | Automotive | Supplier delivered counterfeit parts; not identified before sale; recall required | $45K recall; reputational damage |
| SC-008 | Medical Clinic Preferred Supplier Delisted by Wholesaler | Allied health | Preferred consumable supplier removed from national wholesaler catalogue | Procurement disruption and cost increase |
| SC-009 | Furniture Manufacturer Timber Certification Lapse | Manufacturing | FSC certification for timber supplier lapsed; major retail buyer suspended orders | $180K order suspension |
| SC-010 | Bakery Packaging Supplier Minimum Order Increase 5x | Food manufacturing | Packaging supplier imposed 5x minimum order quantity increase; small operator could not hold inventory | Cash tied up in 12 months of packaging stock |

---

### HR — Human Capital / Key Person Failure

| ID | Title | Industry | Primary Root Cause | Outcome |
|----|-------|----------|-------------------|---------|
| HR-001 | Architecture Firm Senior Designer Departure With Client Relationships | Architecture | Senior designer left and took 3 key client contacts; clients followed | Revenue -35% |
| HR-002 | IT Consultancy Lead Developer Left Before Project Completion | IT consulting | Lead developer left mid-project with undocumented codebase | Project delivered late at cost; client disputed invoice |
| HR-003 | Medical Practice GP Retired Without Succession | General practice | Principal GP retired; patient list not transferred; practice sold below value | Goodwill loss |
| HR-004 | Accounting Firm Partner Illness; No Continuity Plan | Professional services | Senior partner extended illness; no documented client hand-off; clients transferred to competitors | $280K revenue loss |
| HR-005 | Engineering Firm Specialist Poached by Competitor | Engineering | Sole specialist in required certification area poached; firm could no longer tender for certification-required work | Tender exclusion in key segment |
| HR-006 | Childcare Centre Room Leader Departure Cascaded | Childcare | Experienced room leader resigned; three support staff followed; ratio breached | Regulatory notice; parent withdrawals |
| HR-007 | Retail Store Experienced Manager Promoted Away | Retail | Owner promoted best floor manager to area manager role; store performance deteriorated without daily management | Revenue -22% in 8 months |
| HR-008 | Trade Business Foreman Injury Stopped Operations | Plumbing | Sole foreman injured; no qualified second-in-command; active jobs paused | $65K project delay costs |
| HR-009 | Restaurant Head Chef Departure Three Months Post-Open | Hospitality | Head chef hired to launch menu departed 3 months in; kitchen team destabilised | Quality decline; review scores fell |
| HR-010 | Marketing Agency Creative Director Burnt Out | Marketing | Creative director unmanaged burnout; quality of output degraded; two anchor clients issued formal complaints | Anchor clients threatened termination |

---

### FN — Financial Structure / Debt Failure

| ID | Title | Industry | Primary Root Cause | Outcome |
|----|-------|----------|-------------------|---------|
| FN-001 | Café Operator Over-Leveraged on Equipment Finance | Hospitality | $280K equipment finance at 12% over 5 years; revenue insufficient to service | Administration |
| FN-002 | Property Developer Interest Reserve Exhausted | Property development | Construction loan interest reserve consumed before project sold; interest capitalisation exceeded projections | Lender appointed receiver |
| FN-003 | Retail Chain Personal Guarantee Called on Lease | Retail | Director personal guarantee on commercial lease called when company wound up | Personal insolvency |
| FN-004 | SaaS Startup Runway Miscalculation | B2B SaaS | Burn rate underestimated by 35%; runway expired 4 months before next planned raise | Emergency bridge required |
| FN-005 | Manufacturing Business Balloon Payment Not Planned | Manufacturing | $180K balloon payment on business acquisition loan not accounted for in 5-year plan | Emergency refinance required |
| FN-006 | Hospitality Venue ATO Debt Deferred for 2 Years | Hospitality | COVID-era ATO debt deferred; payment plan not entered; demand issued | $210K immediate demand |
| FN-007 | Trade Business Director Drawing Without Declaring Wages | Trades | Owner drawing treated as loans; no PAYG withheld; large personal tax liability arising | $65K personal tax debt |
| FN-008 | Gym Equipment Lease Returning at Market Value Below Residual | Fitness | Equipment lease residual value set at 2019 market; 2024 market below residual; gap owed | $38K lease exit liability |
| FN-009 | Childcare Acquisition Price Based on Non-Recurring Revenue | Childcare | Acquirer paid 4x EBITDA based on EBITDA that included government subsidy not continuing post-acquisition | Immediate impairment |
| FN-010 | Retailer Personal Credit Card Funding Business Operations | Retail | Owner credit card balance $85K funding operational shortfalls; minimum repayments only | Personal insolvency triggered by business failure |

---

## 4. Coverage Summary

| Category | Cases | Industries Represented |
|----------|-------|-----------------------|
| CF (Cash Flow Failure) | 10 | Trade services, retail, construction, hospitality, allied health, IT, fitness |
| MG (Margin Erosion) | 10 | Cleaning, franchise, print, trades, food, IT, landscaping, hospitality, consulting, automotive |
| DM (Demand/Market Failure) | 10 | Photography, real estate, retail, hospitality, fitness, software, financial services |
| GV (Governance/Founder Failure) | 10 | SaaS, hospitality, family business, professional services, manufacturing |
| OP (Operational Failure) | 10 | Trades, courier, hospitality, IT, retail, construction, HVAC, cleaning, childcare |
| ST (Strategy/Positioning Failure) | 10 | Food manufacturing, legal, SaaS, electrical, retail, hospitality, accounting, financial |
| CP (Compliance/Regulatory Failure) | 10 | Hospitality, labour hire, childcare, electrical, food, property, IT, aged care, plumbing, manufacturing |
| SC (Supply Chain/Concentration) | 10 | Industrial, food, construction, retail, IT, hospitality, automotive, medical, manufacturing, bakery |
| HR (Human Capital/Key Person) | 10 | Architecture, IT, medical, professional services, engineering, childcare, retail, trades, hospitality, marketing |
| FN (Financial Structure/Debt) | 10 | Hospitality, property, retail, SaaS, manufacturing, trades, fitness, childcare |
| **Total** | **100** | **35+ distinct industries** |

---

## 5. Root Cause Cross-Reference

These 100 cases map to the following primary OpsIQ business condition categories:

| OpsIQ Condition | Case Count | Representative Cases |
|-----------------|-----------|---------------------|
| CASH_STRESS | 18 | CF-001 through CF-010, FN-001, FN-006, FN-010 |
| MARGIN_EROSION | 16 | MG-001 through MG-010, ST-001, ST-006 |
| DEMAND_FAILURE | 12 | DM-001 through DM-010, ST-003, ST-005 |
| GOVERNANCE_FAILURE | 10 | GV-001 through GV-010 |
| CAPACITY_CONSTRAINT | 8 | OP-001, OP-002, OP-003, OP-007, HR-001, HR-002, HR-008, HR-010 |
| COMPLIANCE_RISK | 10 | CP-001 through CP-010 |
| SUPPLY_CONCENTRATION | 10 | SC-001 through SC-010 |
| KEY_PERSON_DEPENDENCY | 10 | HR-001 through HR-010 |
| FINANCIAL_STRUCTURE | 10 | FN-001 through FN-010 |
| STRATEGY_MISALIGNMENT | 10 | ST-001 through ST-010 |

---

## 6. Anti-Tuning Declaration

This case library was compiled:
- Without access to `diagnosis-engine.ts` source code
- Without access to existing `must_identify` vocabulary in simulation fixtures
- Without modification to scoring weights, thresholds, or engine logic
- For observational and reference purposes only

No case in this library constitutes a training example for the engine. The library is a product knowledge resource, not an engineering input.

---

*This document is part of the OPTION-A Phase F repository completion work.*
