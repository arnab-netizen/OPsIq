/**
 * Location presets — real local-market context (customer/labour/payment/cost/marketing/compliance).
 * Used by seed cases and the expansion generator. Compliance text always points to professional
 * review where exact law/tax is uncertain (no hallucinated legal rules).
 */
import type { LocationContext } from "./schema";

export const LOCATIONS = {
  kolkata: {
    country: "India", cityRegion: "Kolkata, West Bengal", currency: "INR", marketTier: "tier1",
    localCustomerBehavior: "price-sensitive, WhatsApp-first, expects discounts and same-day service",
    localLabourReality: "abundant low-cost labour, high attrition, supervisor trust gaps",
    localPaymentBehavior: "B2B pays 30–45 days late; retail cash/UPI; refunds common",
    localCostPressure: "rent + electricity + water rising; chemical/feed costs volatile",
    localMarketingChannel: "WhatsApp, hyperlocal hoardings, word-of-mouth, Swiggy/Zomato",
    complianceUncertainty: "GST/trade-licence specifics uncertain — flag professional review",
    sourceConfidence: "high", locationSensitivity: "high",
  },
  tier2_india: {
    country: "India", cityRegion: "Tier-2 city", currency: "INR", marketTier: "tier2",
    localCustomerBehavior: "value-seeking, credit-expecting regulars, brand-light",
    localLabourReality: "cheap labour, scheme-driven buying by staff, weak controls",
    localPaymentBehavior: "credit customers delay; supplier schemes drive over-buying",
    localCostPressure: "thin margins, working-capital starvation common",
    localMarketingChannel: "local references, WhatsApp, posters",
    complianceUncertainty: "local licensing/GST uncertain — flag professional review",
    sourceConfidence: "medium", locationSensitivity: "high",
  },
  rural_india: {
    country: "India", cityRegion: "Rural/semi-rural West Bengal", currency: "INR", marketTier: "rural_semirural",
    localCustomerBehavior: "buyers delay payment; relationship-driven",
    localLabourReality: "family/seasonal labour, limited skilled staff",
    localPaymentBehavior: "buyer/aggregator delays payment 30–45 days",
    localCostPressure: "feed/veterinary/input costs volatile; weather shocks",
    localMarketingChannel: "mandi/aggregator, local cooperative, word-of-mouth",
    complianceUncertainty: "animal-health/food-safety norms uncertain — flag professional review",
    sourceConfidence: "medium", locationSensitivity: "high",
  },
  singapore: {
    country: "Singapore", cityRegion: "Singapore", currency: "SGD", marketTier: "metro_premium",
    localCustomerBehavior: "premium, low tolerance for quality failure, expects fast turnaround",
    localLabourReality: "expensive, foreign-worker quota/levy constraints",
    localPaymentBehavior: "B2B mostly on terms but strict SLAs",
    localCostPressure: "high rent and manpower cost",
    localMarketingChannel: "Google, referrals, mall footfall",
    complianceUncertainty: "MOM/GST/licensing uncertain — flag professional review",
    sourceConfidence: "medium", locationSensitivity: "high",
  },
  australia: {
    country: "Australia", cityRegion: "Sydney/Melbourne", currency: "AUD", marketTier: "western",
    localCustomerBehavior: "weekend-heavy hospitality, review-driven",
    localLabourReality: "high wages, penalty rates on weekends/nights, award compliance",
    localPaymentBehavior: "mostly card/on-terms; overtime cost material",
    localCostPressure: "labour and rent dominate cost",
    localMarketingChannel: "Google, Instagram, local press",
    complianceUncertainty: "Fair Work/award rates uncertain — flag professional review",
    sourceConfidence: "medium", locationSensitivity: "high",
  },
  uk: {
    country: "United Kingdom", cityRegion: "London/Manchester", currency: "GBP", marketTier: "western",
    localCustomerBehavior: "discount-trained in some segments; premium in others",
    localLabourReality: "minimum-wage floor, moderate attrition",
    localPaymentBehavior: "B2B on 30-day terms; retail card",
    localCostPressure: "rent and energy high",
    localMarketingChannel: "Google, local social, footfall",
    complianceUncertainty: "VAT/employment specifics uncertain — flag professional review",
    sourceConfidence: "medium", locationSensitivity: "medium",
  },
  us: {
    country: "United States", cityRegion: "Texas / US remote", currency: "USD", marketTier: "western",
    localCustomerBehavior: "service-speed sensitive; invoices paid late in trades",
    localLabourReality: "skilled-tech shortage, high wage",
    localPaymentBehavior: "trades AR runs 30–60 days; SaaS card",
    localCostPressure: "parts/fuel and labour cost",
    localMarketingChannel: "Google, referrals, fleet branding",
    complianceUncertainty: "state tax/licensing uncertain — flag professional review",
    sourceConfidence: "medium", locationSensitivity: "medium",
  },
  uae: {
    country: "UAE", cityRegion: "Dubai/Gulf", currency: "AED", marketTier: "gulf",
    localCustomerBehavior: "premium expectation, brand-conscious, SLA-driven",
    localLabourReality: "migrant labour, accommodation/transport cost, visa rules",
    localPaymentBehavior: "corporate on terms; cheque cycles",
    localCostPressure: "labour accommodation/transport and rent",
    localMarketingChannel: "Instagram, influencer, mall, corporate BD",
    complianceUncertainty: "labour/visa/VAT uncertain — flag professional review",
    sourceConfidence: "medium", locationSensitivity: "high",
  },
  sea: {
    country: "Southeast Asia", cityRegion: "Jakarta/Manila/Bangkok", currency: "local", marketTier: "sea",
    localCustomerBehavior: "mobile-first, price-sensitive, super-app driven",
    localLabourReality: "low-cost labour, informal staffing",
    localPaymentBehavior: "wallet/COD heavy; B2B delays",
    localCostPressure: "platform commissions and logistics",
    localMarketingChannel: "super-apps, social commerce",
    complianceUncertainty: "local tax/licensing uncertain — flag professional review",
    sourceConfidence: "low", locationSensitivity: "high",
  },
  global_online: {
    country: "Global", cityRegion: "Online / distributed", currency: "USD", marketTier: "western",
    localCustomerBehavior: "review/refund-driven, low switching cost",
    localLabourReality: "remote/distributed delivery teams",
    localPaymentBehavior: "card upfront; refunds/chargebacks material",
    localCostPressure: "ad CAC, support, payment fees",
    localMarketingChannel: "paid social, marketplaces, content",
    complianceUncertainty: "cross-border tax/consumer law uncertain — flag professional review",
    sourceConfidence: "low", locationSensitivity: "medium",
  },
  tier3_india: {
    country: "India", cityRegion: "Tier-3 town", currency: "INR", marketTier: "tier3",
    localCustomerBehavior: "deeply price-led, credit-expecting, brand-indifferent",
    localLabourReality: "very cheap labour, minimal skilled supervision, informal hiring",
    localPaymentBehavior: "heavy credit/khata cycles; cash dominates; long delays",
    localCostPressure: "razor-thin margins, frequent working-capital starvation",
    localMarketingChannel: "word-of-mouth, local melas, WhatsApp groups",
    complianceUncertainty: "local licensing/GST registration uncertain — flag professional review",
    sourceConfidence: "low", locationSensitivity: "high",
  },
  dense_urban_premium: {
    country: "India", cityRegion: "South Mumbai / Central Delhi premium", currency: "INR", marketTier: "metro_premium",
    localCustomerBehavior: "premium, convenience-driven, low price sensitivity, high quality expectation",
    localLabourReality: "expensive urban labour, high attrition, parking/access constraints",
    localPaymentBehavior: "card/UPI; corporate on terms; refunds rare but reputation-critical",
    localCostPressure: "very high rent dominates cost structure",
    localMarketingChannel: "Instagram, premium delivery apps, society referrals",
    complianceUncertainty: "municipal/GST/shop-act specifics uncertain — flag professional review",
    sourceConfidence: "medium", locationSensitivity: "high",
  },
  low_income_urban: {
    country: "India", cityRegion: "Peri-urban low-income cluster", currency: "INR", marketTier: "tier3",
    localCustomerBehavior: "extreme price sensitivity, daily-wage cashflow, tiny ticket sizes",
    localLabourReality: "casual/daily labour, no formal contracts, high absenteeism",
    localPaymentBehavior: "cash-only, small amounts, occasional informal credit",
    localCostPressure: "any price rise loses customers; volume-dependent survival",
    localMarketingChannel: "loudspeaker, local handbills, community word-of-mouth",
    complianceUncertainty: "informal-sector licensing uncertain — flag professional review",
    sourceConfidence: "low", locationSensitivity: "high",
  },
} as const satisfies Record<string, LocationContext>;

export type LocationKey = keyof typeof LOCATIONS;

/** Abstracted, non-private location key for learning artifacts (country|tier). */
export function abstractedLocationKey(loc: LocationContext): string {
  return `${loc.country}|${loc.marketTier}`;
}
