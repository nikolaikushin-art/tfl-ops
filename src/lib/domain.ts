/**
 * The Film Location CRM — Domain Model
 * London-based trading company (843 Finchley Rd, London, NW11 8NA)
 * Focus: supplier pricing intelligence, commercial extraction, CRM.
 */

export type UUID = string;

export type Role =
  | "administrator"
  | "management"
  | "commercial"
  | "sales"
  | "finance"
  | "operations"
  | "readonly";

export type Permission =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "export"
  | "approve"
  | "send"
  | "manage_integrations"
  | "manage_users"
  | "manage_settings";

export const ROLE_LABELS: Record<Role, string> = {
  administrator: "Administrator",
  management: "Management",
  commercial: "Commercial",
  sales: "Sales",
  finance: "Finance",
  operations: "Operations",
  readonly: "Read Only",
};

/* -------------------------------------------------------------------------- */
/* Core entities                                                              */
/* -------------------------------------------------------------------------- */

export interface User {
  id: UUID;
  email: string;
  name: string;
  role: Role;
  avatarUrl?: string;
  createdAt: string;
  lastLoginAt?: string;
  isActive: boolean;
}

/* -------------------------------------------------------------------------- */
/* Organisation & configuration                                               */
/* -------------------------------------------------------------------------- */

export interface Organisation {
  legalName: string;
  tradingName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postcode?: string;
  country: string;
  vatNumber?: string;
  registrationNumber?: string;
  defaultCurrency: string;
  phone?: string;
  email?: string;
  website?: string;
}

export interface CrmSettings {
  leadSources: string[];
  customerSegments: string[];
  /** Territories offered when assigning a customer. Free-form so the list can
   *  be reshaped per market without a code change. */
  salesTerritories: string[];
  defaultOwnerId?: UUID;
  requireKycForOnboarding: boolean;
  followUpReminderDays: number;
  /** How many days before `Document.expiresAt` a document counts as expiring. */
  documentExpiryWarningDays: number;
}

export interface SalesSettings {
  quotationPrefix: string;
  quotationValidityDays: number;
  orderPrefix: string;
  invoicePrefix: string;
  defaultPaymentTerms: string;
  defaultTaxRatePct: number;
  requireApprovalAboveAmount?: number;
}

/**
 * Commercial policy for the Trade Desk. TFL trades under bond, back-to-back:
 * there is no import duty, insurance or freight cost in a deal, so none is
 * held here.
 */
export interface TradeSettings {
  /** Margin the desk aims for on a quotation, in percent. */
  targetMarginPct: number;
  /** Price move, in percent over the window, that is worth a signal. */
  priceAlertThresholdPct: number;
  /** v26: Roni's FX decision. Left undefined until he chooses; we do not choose for him. */
  fxPolicy?: "live" | "controlled";
}

export interface ProductSettings {
  categories: string[];
  units: string[];
  defaultCurrency: string;
  lowMarginThresholdPct: number;
}

export interface Contact {
  id: UUID;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  jobTitle?: string;
  isPrimary: boolean;
  notes?: string;
  customerId?: UUID;
  supplierId?: UUID;
  /** Follow-up for this person (in addition to the company-level one); feeds Notifications. */
  followUpDate?: string;
  followUpNote?: string;
  createdAt: string;
  updatedAt: string;
}

export type CustomerStatus = "lead" | "active" | "inactive" | "onboarding" | "blocked";
export type CustomerSegment = "wholesale" | "retail" | "distributor" | "end_user" | "other";

export interface Customer {
  id: UUID;
  name: string;
  tradingName?: string;
  status: CustomerStatus;
  segment: CustomerSegment;
  email?: string;
  phone?: string;
  website?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postcode?: string;
  country: string;
  vatNumber?: string;
  companyNumber?: string;
  paymentTerms?: string;
  currency: string;
  tags: string[];
  notes?: string;
  /**
   * Relationship manager — the person who owns this account commercially.
   * A separate `relationshipManagerId` was considered and rejected: it would
   * duplicate this field with no behavioural difference. The UI labels it
   * "Relationship manager".
   */
  ownerId?: UUID;
  /** Sales territory, drawn from `CrmSettings.salesTerritories`. */
  territory?: string;
  kycStatus: "none" | "pending" | "approved" | "rejected" | "expired";
  /** v17: follow-up date + note replace Meetings; feeds Notifications. */
  followUpDate?: string;
  followUpNote?: string;
  /** v17: TFL's own judgement of the counterparty. */
  myRating?: "reliable" | "caution" | "avoid";
  /** v17: a company can hold several roles; used by the merged directory. */
  extraRoles?: ContactRole[];
  tradeTerms?: TradeTerms;
  /** v18: shared profile (types, region, language, source, warehouse terms…). */
  profile?: PartyProfile;
  /** v18: links the buyer and supplier facets of one company. */
  partyId?: UUID;
  /** v18: authoritative role list (falls back to buyer + extraRoles). */
  roles?: ContactRole[];
  relationshipScore?: number;
  totalRevenue?: number;
  totalOrders?: number;
  lastOrderAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: UUID;
}

export type SupplierStatus = "lead" | "onboarding" | "active" | "inactive" | "preferred" | "blocked";

/** v17 — roles in the single Contacts directory. */
export type ContactRole =
  | "buyer"
  | "supplier"
  | "trader"
  | "warehouse"
  | "broker"
  | "service"
  | "other";
export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  buyer: "Buyer",
  supplier: "Supplier",
  trader: "Trader",
  warehouse: "Warehouse",
  broker: "Broker / agent",
  service: "Other service",
  other: "Other",
};
export type BuyerType =
  | "importer" | "distributor" | "wholesaler" | "duty_free" | "retail_chain"
  | "on_trade" | "ship_supply" | "ecommerce" | "other";
export const BUYER_TYPE_LABELS: Record<BuyerType, string> = {
  importer: "Importer", distributor: "Distributor", wholesaler: "Wholesaler",
  duty_free: "Duty-free / travel retail", retail_chain: "Retail chain",
  on_trade: "On-trade / hospitality", ship_supply: "Ship supply / diplomatic",
  ecommerce: "E-commerce", other: "Other",
};
export type SupplierType =
  | "brand_owner" | "official_distributor" | "parallel_trader" | "wholesaler" | "duty_free" | "other";
export const SUPPLIER_TYPE_LABELS: Record<SupplierType, string> = {
  brand_owner: "Brand owner / distillery", official_distributor: "Official distributor",
  parallel_trader: "Parallel trader", wholesaler: "Wholesaler",
  duty_free: "Duty-free / travel retail", other: "Other",
};
export type BrandStrength = "occasional" | "regular" | "official";

/** v18 — everything Roni wants on a contact that is not in the older records.
 *  Stored on every facet of a party (buyer record, supplier record) and kept
 *  in step by the directory, so one company is one set of facts. */
export interface PartyProfile {
  /** A trader with no company behind them. */
  soleTrader?: boolean;
  buyerType?: BuyerType;
  supplierType?: SupplierType;
  region?: string;
  address?: string;
  language?: string;
  source?: string;
  whatsapp?: string;
  /** Brand -> how strong they are with it. Kept separately per side. */
  brandStrengthBuyer?: Record<string, BrandStrength>;
  brandStrengthSupplier?: Record<string, BrandStrength>;
  /** Warehouses only: pulled through to deals automatically. */
  warehouse?: {
    escrowFeePct?: number;
    escrowFeeFlat?: number;
    storagePerPalletPerWeek?: number;
    releaseTerms?: string;
    releaseDays?: number;
  };
  /** Free-form tags added by Roni. */
  freeTags?: string[];
}

export interface TradeTerms {
  dutyStatus?: DutyStatus;
  incoterms?: string;
  currency?: string;
  payment?: "escrow" | "direct";
  typicalVolume?: string;
  categories?: string[];
  brandsAsBuyer?: string[];
  brandsAsSupplier?: string[];
}

export interface Supplier {
  id: UUID;
  name: string;
  tradingName?: string;
  status: SupplierStatus;
  email?: string;
  phone?: string;
  website?: string;
  addressLine1?: string;
  city?: string;
  postcode?: string;
  country: string;
  vatNumber?: string;
  paymentTerms?: string;
  currency: string;
  tags: string[];
  notes?: string;
  /** Relationship manager — the person who owns this supplier commercially. */
  ownerId?: UUID;
  relationshipScore?: number;
  totalSpend?: number;
  totalOrders?: number;
  priceCompetitiveness?: number;
  deliveryPerformance?: number;
  lastOfferAt?: string;
  createdAt: string;
  updatedAt: string;
  followUpDate?: string;
  followUpNote?: string;
  myRating?: "reliable" | "caution" | "avoid";
  extraRoles?: ContactRole[];
  tradeTerms?: TradeTerms;
  profile?: PartyProfile;
  partyId?: UUID;
  roles?: ContactRole[];
}

export interface Product {
  id: UUID;
  sku: string;
  name: string;
  description?: string;
  category?: string;
  unit: string;
  packaging?: string;
  specifications?: string;
  purchasePrice?: number;
  sellingPrice?: number;
  currency: string;
  supplierIds: UUID[];
  /** The brand this SKU is sold under. Optional because a product can be
   *  catalogued before its brand relationship is confirmed — the same
   *  "onboarded but not fully loaded" gap `Brand` itself allows for. */
  brandId?: UUID;
  tags: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** v18 — identity */
  subCategory?: string;
  /** Age statement or vintage, e.g. "12 Year Old" or "2018". */
  ageOrVintage?: string;
  edition?: string;
  /** v18 — bottle */
  bottleSizeCl?: number;
  abv?: number;
  giftBox?: boolean;
  labelLanguage?: string;
  refillable?: boolean;
  /** v18 — packing */
  bottlesPerCase?: number;
  casesPerLayer?: number;
  casesPerPallet?: number;
  palletType?: string;
  caseWeightKg?: number;
  ean?: string;
  /** v18 — origin = country of production. */
  originCountry?: string;
  /** Other names the product appears under in offers, so extraction can
   *  recognise "JWB 12x1L" as Johnnie Walker Black Label 1L. */
  aliases?: string[];
}

/* -------------------------------------------------------------------------- */
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

export type BrandStatus = "active" | "onboarding" | "inactive" | "discontinued";

export const BRAND_STATUS_LABELS: Record<BrandStatus, string> = {
  active: "Active",
  onboarding: "Onboarding",
  inactive: "Inactive",
  discontinued: "Discontinued",
};

/**
 * The connective layer every module so far has implicitly assumed exists:
 * Brand → Portfolio → Products → Suppliers → Markets → Customers. A brand is
 * modelled separately from `Supplier` because the two relationships are
 * genuinely different — a supplier is who TFL buys from and pays;
 * a brand is what is being sold, and can be owned by a party distinct from
 * the producer TFL sources it through (`brandOwner` vs `supplierId`).
 * SKU counts, revenue, customers and countries are never stored on the
 * brand record itself — they're derived from `Product`/`Order`/`Customer`
 * in `lib/brand.ts`, the same discipline as `excise.ts`/`warehouse.ts`, so
 * a brand's numbers can't drift from the products actually carrying them.
 */
export interface Brand {
  id: UUID;
  name: string;
  /** Legal or commercial owner of the brand, where it differs from the
   *  supplier TFL sources it through (e.g. a house brand vs. a licensed
   *  distribution agreement). */
  brandOwner?: string;
  /** The supplier/producer TFL sources this brand through. */
  supplierId?: UUID;
  /** Country of origin. */
  country: string;
  category?: string;
  subcategory?: string;
  /** Customer segments this brand is positioned for. */
  segments: CustomerSegment[];
  status: BrandStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Market / Country                                                          */
/* -------------------------------------------------------------------------- */

export type MarketStatus = "active" | "emerging" | "restricted" | "dormant";

export const MARKET_STATUS_LABELS: Record<MarketStatus, string> = {
  active: "Active",
  emerging: "Emerging",
  restricted: "Restricted",
  dormant: "Dormant",
};

/**
 * The geographic layer `Brand.countriesForBrand` was already reading off
 * customer records rather than a real entity — this is that entity.
 * A `Market` is a country (or, for `region`, the wider area it reports
 * into) that TFL trades with or is assessing. As with `Brand`, coverage
 * numbers — which customers, suppliers, warehouses, orders and revenue
 * touch a market — are never stored here; they're derived from deals in `lib/tradeFlow.ts`
 * from the records that actually carry a country, so a market's figures
 * can't drift from the customers and orders producing them.
 */
export interface Market {
  id: UUID;
  /** Country name, matched against `Customer.country` / `Supplier.country`
   *  / `Warehouse.country` for coverage lookups. */
  country: string;
  /** Wider trading region, e.g. "Europe", "Americas", "Middle East" — also
   *  matched against `Warehouse.servesMarkets`, which routes by region as
   *  often as by country. */
  region: string;
  currency: string;
  status: MarketStatus;
  /** Free-text regulatory or licensing notes — duty regime, labelling
   *  requirements, import licence status. Distinct from `notes`, which is
   *  commercial commentary. */
  complianceNotes?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Pricing Intelligence (core differentiator)                                 */
/* -------------------------------------------------------------------------- */

export type OfferStatus = "draft" | "pending_review" | "approved" | "rejected" | "expired" | "converted";
export type ExtractionSource = "email" | "whatsapp" | "pdf" | "excel" | "manual";

export interface PricingRecord {
  id: UUID;
  productId?: UUID;
  productName: string;
  supplierId?: UUID;
  supplierName: string;
  quantity?: number;
  unitPrice: number;
  /** What unitPrice is for, when the source says (never assumed). */
  priceUnit?: "case" | "bottle" | "pallet";
  currency: string;
  deliveryInfo?: string;
  commercialTerms?: string;
  validUntil?: string;
  source: ExtractionSource;
  sourceRef?: string; // email id / file name
  status: OfferStatus;
  extractedAt: string;
  approvedAt?: string;
  approvedBy?: UUID;
  originalText?: string;
  customFields?: Record<string, string | number>;
  createdAt: string;
  updatedAt: string;
  /** v18 — structured commercial terms (replaces the free-text delivery box).
   *  This is the start of the commercial-terms list Roni will extend. */
  dutyStatus?: DutyStatus;
  incoterm?: string;
  incotermPlace?: string;
  goodsLocation?: string;
  paymentTerms?: string;
  leadTimeDays?: number;
  minQuantity?: number;
  /** Date printed on the offer itself (not the date we read it). */
  offerDate?: string;
  /** Which import batch produced this row; used for duplicate checks. */
  importBatchId?: string;
  /** How sure the reader was (0-1). Low-confidence rows are flagged in review. */
  confidence?: number;
}

export interface AiExtractionJob {
  id: UUID;
  source: ExtractionSource;
  sourceRef: string;
  originalContent: string;
  status: "queued" | "processing" | "pending_review" | "approved" | "rejected";
  extractedRecords: PricingRecord[];
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: UUID;
}

/* -------------------------------------------------------------------------- */
/* Warehousing & Inventory                                                    */
/* -------------------------------------------------------------------------- */

/** v17: TFL trades everything under bond. "duty_paid" was removed; legacy
 *  data carrying it is normalised to "bonded" by `normaliseWarehouseType`. */
export type WarehouseType = "bonded" | "distribution_hub";
export const normaliseWarehouseType = (t: string): WarehouseType =>
  t === "distribution_hub" ? "distribution_hub" : "bonded";

export const WAREHOUSE_TYPE_LABELS: Record<WarehouseType, string> = {
  bonded: "Bonded warehouse",
  distribution_hub: "Distribution hub",
};

/**
 * A storage location in TFL's network. `isBonded` marks a bonded site. TFL only
 * trades under bond (T1/T2); nothing is sold duty paid. It is kept
 * as its own field (rather than derived from `type`) because a distribution
 * hub can itself hold a bonded section.
 */
export interface Warehouse {
  id: UUID;
  name: string;
  /** Short code used on documents and shipment references, e.g. "LHR-B1". */
  code: string;
  type: WarehouseType;
  isBonded: boolean;
  country: string;
  city?: string;
  addressLine1?: string;
  /** Third-party logistics operator running the site, where it isn't TFL's own. */
  operator?: string;
  /** Regions/markets this site primarily serves — used to route allocations. */
  servesMarkets?: string[];
  capacityPallets?: number;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type StockMovementType =
  | "goods_in"
  | "goods_out"
  | "transfer_in"
  | "transfer_out"
  | "adjustment";

/**
 * A single audited change to a stock line. Kept separate from `InventoryItem`
 * so the on-hand figure is always a consequence of its movement history
 * rather than a number someone can silently overwrite.
 */
export interface StockMovement {
  id: UUID;
  inventoryItemId: UUID;
  warehouseId: UUID;
  productId: UUID;
  type: StockMovementType;
  /** Positive for stock arriving, negative for stock leaving. */
  quantity: number;
  reference?: string;
  orderId?: UUID;
  notes?: string;
  occurredAt: string;
  createdBy?: UUID;
}

/**
 * Stock of one product, in one warehouse, optionally split by batch/lot.
 * `quantityOnHand` is physical stock actually in the building; `available`
 * is a derived figure (on hand minus reserved minus damaged/on-hold), never
 * stored, so it cannot drift out of sync with the components it is made of.
 */
export interface InventoryItem {
  id: UUID;
  warehouseId: UUID;
  productId: UUID;
  batchOrLot?: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityIncoming: number;
  quantityDamaged: number;
  /** Unit stock is counted in — normally the product's own `unit` (case). */
  unit: string;
  lastMovementAt: string;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Global Freight & Last-Mile Delivery                                        */
/* -------------------------------------------------------------------------- */

export type ShipmentMode = "sea" | "air" | "road";

export const SHIPMENT_MODE_LABELS: Record<ShipmentMode, string> = {
  sea: "Sea freight",
  air: "Air freight",
  road: "Road freight",
};

export type ShipmentStatus =
  | "booked"
  | "in_transit"
  | "customs"
  | "arrived"
  | "delivered"
  | "delayed"
  | "cancelled";

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  booked: "Booked",
  in_transit: "In transit",
  customs: "In customs",
  arrived: "Arrived",
  delivered: "Delivered",
  delayed: "Delayed",
  cancelled: "Cancelled",
};

/**
 * One freight leg — the sea/air/road journey from a TFL warehouse (or a
 * supplier's origin) to a destination market, coordinated with a carrier
 * partner. Kept separate from `Delivery` because a single order can involve
 * several shipments (the split air/sea case on order o2), and because a
 * shipment tracks the freight journey itself (mode, carrier, ETA, customs)
 * rather than the despatch paperwork a delivery note represents. A shipment
 * that clears the freight leg becomes the input to a `Delivery`'s last-mile
 * leg, linked via `deliveryId` once despatch for final delivery begins.
 */
export interface Shipment {
  id: UUID;
  reference: string;
  orderId?: UUID;
  customerId?: UUID;
  /** Delivery record covering the last-mile leg once this shipment lands. */
  deliveryId?: UUID;
  originWarehouseId?: UUID;
  originCountry?: string;
  destinationCountry: string;
  destinationMarket?: string;
  mode: ShipmentMode;
  carrier: string;
  /** Carrier booking or bill-of-lading / airway-bill reference. */
  trackingRef?: string;
  incoterms?: string;
  status: ShipmentStatus;
  etd?: string;
  eta: string;
  actualDeparture?: string;
  actualArrival?: string;
  /** Free-text list of shipping/customs documents this shipment needs. */
  documentsRequired?: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Proof captured on final delivery — required whenever an order's last-mile
 * leg completes, kept on the `Delivery` record itself since it describes how
 * that specific despatch was received rather than the freight journey.
 */
export interface ProofOfDelivery {
  receivedBy?: string;
  method?: "signature" | "photo" | "code" | "none";
  signedAt?: string;
  notes?: string;
}

export type DeliveryExceptionType = "damage" | "shortage" | "delay" | "refused" | "other";

/**
 * A last-mile problem flagged against a despatch — damage discovered on
 * arrival, a short count, a refused delivery. Kept on the delivery record
 * (not the order) because it describes what happened to this specific
 * consignment, and `resolved` lets Signals/Executive Intelligence surface
 * only the ones still open.
 */
export interface DeliveryException {
  type: DeliveryExceptionType;
  description: string;
  reportedAt: string;
  resolved: boolean;
  resolvedAt?: string;
}

/* -------------------------------------------------------------------------- */
/* Requirements, Opportunities, Sales                                         */
/* -------------------------------------------------------------------------- */

/** v18: one Request, one lifecycle — New → Matched → Quoted → Won / Lost.
 *  The legacy values stay in the union so stored data keeps loading; use
 *  `normaliseRequestStatus` (lib/requests.ts) to read them. */
export type RequirementStatus =
  | "new"
  | "matched"
  | "quoted"
  | "won"
  | "lost"
  | "open"
  | "matching"
  | "cancelled";

export interface CustomerRequirement {
  id: UUID;
  customerId: UUID;
  productName: string;
  productId?: UUID;
  quantity?: number;
  specification?: string;
  destination?: string;
  deliveryRequirements?: string;
  timing?: string;
  commercialRequirements?: string;
  status: RequirementStatus;
  ownerId?: UUID;
  matchedSupplierIds: UUID[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
  /** v18 */
  source?: "email" | "whatsapp" | "excel" | "manual";
  sourceRef?: string;
  targetPrice?: number;
  currency?: string;
  /** Alert flag: set once when the first match is found so we notify once. */
  matchNotified?: boolean;
  /** Set when an accepted quote has been turned into a potential deal. */
  dealId?: UUID;
  importBatchId?: string;
}

export type OpportunityStage =
  | "enquiry"
  | "quotation"
  | "order"
  | "delivery"
  | "invoice"
  | "payment"
  | "closed_won"
  | "closed_lost";

export interface Opportunity {
  id: UUID;
  customerId: UUID;
  requirementId?: UUID;
  productId?: UUID;
  supplierId?: UUID;
  pricingRecordId?: UUID;
  title: string;
  stage: OpportunityStage;
  value?: number;
  currency: string;
  ownerId?: UUID;
  nextAction?: string;
  nextActionDue?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type QuotationStatus = "draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired" | "converted";

export interface QuotationLine {
  id: UUID;
  productId?: UUID;
  description: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  discountPct?: number;
}

export interface Quotation {
  id: UUID;
  number: string;
  customerId: UUID;
  opportunityId?: UUID;
  /** v18: quotes are created from a request and stay attached to it. */
  requirementId?: UUID;
  /** Set once an accepted quote has been taken on to the Deal Desk. */
  dealId?: UUID;
  status: QuotationStatus;
  lines: QuotationLine[];
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  validUntil?: string;
  notes?: string;
  sentAt?: string;
  followUpAt?: string;
  convertedOrderId?: UUID;
  createdAt: string;
  updatedAt: string;
  createdBy?: UUID;
}

export type OrderStatus = "draft" | "confirmed" | "in_progress" | "shipped" | "delivered" | "cancelled";

export interface Order {
  id: UUID;
  number: string;
  customerId: UUID;
  quotationId?: UUID;
  status: OrderStatus;
  lines: QuotationLine[];
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  deliveryDate?: string;
  /** Agreed shipping terms, carried onto the delivery note and the invoice. */
  incoterms?: string;
  deliveryAddress?: string;
  customerReference?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A despatch against an order.
 *
 * Deliveries are separate records rather than fields on the order because a
 * single order is routinely shipped in parts — the case the old single
 * "delivery date" field could not express, and the reason the order → delivery
 * → invoice step had nothing real behind it.
 */
export interface Delivery {
  id: UUID;
  orderId: UUID;
  reference: string;
  /** Quantity despatched per order line, keyed by line id. */
  quantities: Record<UUID, number>;
  carrier?: string;
  trackingRef?: string;
  despatchedAt: string;
  deliveredAt?: string;
  incoterms?: string;
  destination?: string;
  notes?: string;
  createdAt: string;
  /** The freight leg (sea/air/road) that got this consignment to market. */
  shipmentId?: UUID;
  /** Captured once the last-mile leg completes; absent while in transit. */
  proofOfDelivery?: ProofOfDelivery;
  /** A last-mile problem on this consignment, if one was reported. */
  exception?: DeliveryException;
}

export type InvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "cancelled" | "partial";

export interface Invoice {
  id: UUID;
  /** v26: which company's books this belongs to. Empty = the primary company. */
  companyId?: string;
  number: string;
  customerId: UUID;
  orderId?: UUID;
  status: InvoiceStatus;
  lines: QuotationLine[];
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  issuedAt?: string;
  dueAt?: string;
  paidAt?: string;
  amountPaid?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ExpenseCategory =
  | "purchases"
  | "freight_duty"
  | "salaries"
  | "premises"
  | "professional_fees"
  | "marketing"
  | "travel"
  | "software"
  | "bank_charges"
  | "other";

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  purchases: "Purchases / cost of goods",
  freight_duty: "Shipping & storage",
  salaries: "Salaries & staff",
  premises: "Premises",
  professional_fees: "Professional fees",
  marketing: "Marketing",
  travel: "Travel & subsistence",
  software: "Software & IT",
  bank_charges: "Bank charges",
  other: "Other",
};

/**
 * A purchase or overhead. `category` drives where it lands in the P&L:
 * `purchases` and `freight_duty` are cost of sales, everything else is an
 * operating expense. Keeping that mapping in one place is what lets gross
 * profit be a measured figure rather than an assumption.
 */
export interface Expense {
  id: UUID;
  date: string;
  description: string;
  category: ExpenseCategory;
  supplierId?: UUID;
  supplierName?: string;
  /** Net of recoverable VAT. */
  net: number;
  vat: number;
  currency: string;
  reference?: string;
  /** Links the cost back to what it was incurred for. */
  orderId?: UUID;
  /** v26: which company's books this belongs to. Empty = the primary company. */
  companyId?: string;
  /** v17: expenses tied to a deal reduce that deal's net margin. */
  dealId?: UUID;
  /** v17: company card vs paid personally (then needs reimbursing). */
  paidBy?: "company_card" | "personal";
  reimbursementStatus?: "not_required" | "owed" | "reimbursed";
  productId?: UUID;
  isPaid: boolean;
  paidAt?: string;
  createdAt: string;
}

export type PaymentDirection = "in" | "out";

export interface Payment {
  id: UUID;
  /** Money received against a sales invoice, or paid out against an expense. */
  direction: PaymentDirection;
  invoiceId?: UUID;
  expenseId?: UUID;
  customerId?: UUID;
  supplierId?: UUID;
  amount: number;
  currency: string;
  method?: "bank_transfer" | "card" | "cash" | "cheque" | "other";
  reference?: string;
  notes?: string;
  paidAt: string;
  createdBy?: UUID;
  createdAt: string;
}

export const PAYMENT_METHOD_LABELS: Record<
  NonNullable<Payment["method"]>,
  string
> = {
  bank_transfer: "Bank transfer",
  card: "Card",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

/* -------------------------------------------------------------------------- */
/* Communications & Documents                                                 */
/* -------------------------------------------------------------------------- */

export type CommChannel = "email" | "whatsapp" | "note" | "call" | "system";
export type CommDirection = "inbound" | "outbound" | "internal";

/** Where a message sits in the mailbox. Derived folders (starred, flagged) are
 *  computed from flags rather than stored, so a message is only ever in one. */
export type MailFolder = "inbox" | "sent" | "drafts" | "archive";

export interface MailAttachment {
  id: UUID;
  name: string;
  mimeType?: string;
  size?: number;
  /** Set once the attachment has been filed into Documents. */
  documentId?: UUID;
}

export interface Communication {
  id: UUID;
  channel: CommChannel;
  direction: CommDirection;
  subject?: string;
  body: string;
  from?: string;
  fromName?: string;
  to?: string;
  cc?: string;
  customerId?: UUID;
  supplierId?: UUID;
  contactId?: UUID;
  opportunityId?: UUID;
  /** Links to the commercial record this message is about, so the reading pane
   *  can show (and open) the quotation/order/invoice it refers to. */
  quotationId?: UUID;
  orderId?: UUID;
  invoiceId?: UUID;
  productId?: UUID;
  pricingRecordId?: UUID;
  relatedEntityType?: string;
  relatedEntityId?: UUID;
  isReceived: boolean; // for extraction rule: only received
  /** v25: the mailbox (Zoho address) this message arrived on / was sent from. */
  mailbox?: string;
  /** v25: came from the provider's spam / junk folder; never filed or extracted. */
  junk?: boolean;
  /** Mail client state. Optional so older records keep working. */
  folder?: MailFolder;
  isRead?: boolean;
  isStarred?: boolean;
  isFlagged?: boolean;
  /** Messages sharing a threadId render as one conversation. */
  threadId?: UUID;
  attachments?: MailAttachment[];
  /** True when AI extraction has already pulled commercial terms out of this
   *  message — prevents the same offer being banked twice. */
  extracted?: boolean;
  occurredAt: string;
  createdAt: string;
}

export interface Document {
  id: UUID;
  name: string;
  type: "contract" | "quotation" | "order" | "invoice" | "kyc" | "certificate" | "correspondence" | "other";
  /** v18: companies/people this file belongs to (stored once, shown everywhere). */
  warehouseId?: UUID;
  /** v18: waiting for Roni to confirm the AI's filing. */
  needsConfirmation?: boolean;
  /** Issuer's own reference — certificate number, contract number, policy number. */
  reference?: string;
  /** When the document was issued by its originator (not when it was uploaded). */
  issuedAt?: string;
  /** When it stops being valid. Absent means the document does not expire. */
  expiresAt?: string;
  mimeType?: string;
  size?: number;
  url?: string;
  /** v48: the file's own name, and the text read from inside it (PDF/Excel/CSV/text), so deal capture can use the contents. */
  originalName?: string;
  extractedText?: string;
  customerId?: UUID;
  supplierId?: UUID;
  productId?: UUID;
  opportunityId?: UUID;
  /** v17: documents are stored once and filed against the deal folder too. */
  dealId?: UUID;
  /** v17: the two library categories Roni asked for, plus a type tag. */
  library?: "kyc_company" | "deals_contracts_shipping";
  docTag?: string;
  kycRecordId?: UUID;
  /** v23: an expense receipt/invoice belongs with Accounting, not the library. */
  expenseId?: UUID;
  /** v23: why the AI/rule filed it where it did (shown in the confirm queue). */
  filingNote?: string;
  source?: string;
  uploadedBy?: UUID;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/* KYC / Onboarding                                                           */
/* -------------------------------------------------------------------------- */

export type KycStatus = "draft" | "sent" | "submitted" | "under_review" | "approved" | "rejected" | "changes_requested";

export interface KycRecord {
  id: UUID;
  /** Id of the buyer or supplier this case is about (field name kept for
   *  backwards compatibility — see `partyType`). */
  customerId: UUID;
  /** v17: KYC covers buyers, suppliers, traders and warehouses. */
  partyType?: "customer" | "supplier";
  status: KycStatus;
  secureToken?: string;
  submittedData?: Record<string, unknown>;
  reviewNotes?: string;
  reviewedBy?: UUID;
  reviewedAt?: string;
  sentAt?: string;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Campaigns, Audit, Activity                                                 */
/* -------------------------------------------------------------------------- */

/** Rules that resolve to a recipient list at send time, so a segment stays
 *  live rather than freezing a snapshot of contacts taken when it was built. */
export interface CampaignAudience {
  /** Which side of the book to mail. */
  target: "customers" | "suppliers" | "contacts";
  statuses?: string[];
  segments?: CustomerSegment[];
  territories?: string[];
  countries?: string[];
  tags?: string[];
  /** Exclude accounts with no order in this many days (0 = no rule). */
  minRecencyDays?: number;
  /** Exclude anyone whose KYC is not approved. */
  kycApprovedOnly?: boolean;
  /** v19: a hand-picked list from the Contacts filters. When present it IS
   *  the audience and the rules above are ignored. */
  explicit?: { name: string; email: string }[];
}

export interface CampaignRecipient {
  id: UUID;
  name: string;
  email: string;
  entityId: UUID;
  entityType: "customer" | "supplier" | "contact";
  delivered: boolean;
  opened: boolean;
  clicked: boolean;
  bounced: boolean;
}

export interface Campaign {
  id: UUID;
  name: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "cancelled";
  subject: string;
  preheader?: string;
  templateBody: string;
  /** Free-text description kept for older records; `audience` is authoritative. */
  segmentFilter?: string;
  audience: CampaignAudience;
  recipients: CampaignRecipient[];
  recipientCount: number;
  sentCount: number;
  openCount?: number;
  clickCount?: number;
  bounceCount?: number;
  /** Attach a generated product portfolio or price list to the send. */
  attachPortfolio?: boolean;
  scheduledAt?: string;
  sentAt?: string;
  createdBy?: UUID;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: UUID;
  userId: UUID;
  userName: string;
  entityType: string;
  entityId: UUID;
  action: string;
  previousValue?: string;
  newValue?: string;
  createdAt: string;
}

export interface Activity {
  id: UUID;
  type: string;
  title: string;
  description?: string;
  entityType?: string;
  entityId?: UUID;
  userId?: UUID;
  createdAt: string;
}

/* -------------------------------------------------------------------------- */
/* Dashboard metrics helpers                                                  */
/* -------------------------------------------------------------------------- */

export interface DashboardMetrics {
  totalRevenue: number;
  grossProfit: number;
  netProfit: number;
  openOpportunities: number;
  pendingKyc: number;
  newOffers: number;
  activeRequirements: number;
  followUpsDue: number;
  /** Documents inside the expiry warning window, and those already lapsed. */
  documentsExpiring: number;
  documentsExpired: number;
  topCustomers: { id: UUID; name: string; revenue: number }[];
  topSuppliers: { id: UUID; name: string; spend: number }[];
  recentPricingChanges: PricingRecord[];
}


/* -------------------------------------------------------------------------- */
/* Deals (v17) — back-to-back trading, everything under bond, escrow settled */
/* -------------------------------------------------------------------------- */

/** Bonded movements only. There is deliberately no "duty paid" option. */
export type DutyStatus = "T1" | "T2";

export type DealStage =
  | "agreed"
  | "awaiting_deposit"
  | "in_escrow"
  | "released"
  | "margin_received"
  | "booked"
  | "cancelled";

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  agreed: "Agreed",
  awaiting_deposit: "Awaiting deposit",
  in_escrow: "Funds in escrow",
  released: "Released / shipped",
  margin_received: "Margin received",
  booked: "Booked in Xero",
  cancelled: "Cancelled",
};

export type XeroPostingStatus = "not_posted" | "draft" | "approved" | "reconciled";

export interface DealChecklist {
  kycApproved: boolean;
  contractSigned: boolean;
  preAdviceReceived: boolean;
  depositConfirmed: boolean;
  releaseConfirmed: boolean;
}

export interface DealIssue {
  kind: "damaged" | "short" | "incorrect" | "other";
  note: string;
  /** Claim or credit-note reference. */
  claimRef?: string;
  raisedAt: string;
}

export interface Deal {
  id: UUID;
  /** Human reference, also used as the Xero tracking category. */
  ref: string;
  stage: DealStage;
  /** The story: request -> quote -> deal. */
  requirementId?: UUID;
  quotationId?: UUID;
  offerId?: UUID;
  /** Parties. Warehouse acts as escrow provider. */
  clientId: UUID;
  supplierId: UUID;
  warehouseId?: UUID;
  /** Own-stock lot the goods come from (stock is deducted when the sale becomes real). */
  stockLotId?: string;
  productDescription: string;
  productId?: UUID;
  quantity: number;
  unit: string;
  /** Deal currency (mostly EUR / USD). All money fields below are in it. */
  currency: string;
  /** Total paid by the client into escrow. */
  salePrice: number;
  /** Total the supplier receives. */
  purchasePrice: number;
  /** Rate to the reporting currency, recorded on the deal (not live). */
  exchangeRate?: number;
  escrowFees: number;
  bankCharges: number;
  /** Net margin received, once it lands. */
  actualMargin?: number;
  dutyStatus: DutyStatus;
  incoterm?: string;
  incotermPlace?: string;
  origin: string;
  goodsLocation: string;
  transit?: string;
  destination: string;
  releaseDate?: string;
  transport?: string;
  tracking?: string;
  eta?: string;
  delivered?: boolean;
  depositDate?: string;
  depositAmount?: number;
  supplierPaidDate?: string;
  supplierPaidAmount?: number;
  marginReceivedDate?: string;
  checklist: DealChecklist;
  issue?: DealIssue;
  xero: { status: XeroPostingStatus; draftRef?: string; postedAt?: string };
  /** Created automatically from email/documents and waiting for approval. */
  pendingApproval?: boolean;
  /** True on a draft whose T1/T2 status was a placeholder, not read from the document. Cleared when someone picks it. */
  dutyUnconfirmed?: boolean;
  /** v26: loaded from history. Already in the books, so never offered for Xero posting. */
  historical?: boolean;
  /** v26: which company's books this deal belongs to. Empty = the primary company. */
  companyId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
