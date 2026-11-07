import { describe, expect, it } from "vitest";
import { convert, rateLabel, staleRates, sumInCurrency, type FxTable } from "@/lib/fx";
import { bestOfferFor, documentMargin, type MarginContext } from "@/lib/margin";
import { priceCurve, priceMoves, supplierSpread } from "@/lib/priceIndex";
import { briefText, buildSignals, KIND_LABELS, summariseSignals, type SignalInput } from "@/lib/signals";
import type {
  Customer,
  Invoice,
  Order,
  Payment,
  PricingRecord,
  Product,
  Quotation,
  QuotationLine,
} from "@/lib/domain";

const NOW = new Date("2026-06-01T12:00:00.000Z");
const dayMs = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * dayMs).toISOString();
const daysAhead = (n: number) => new Date(NOW.getTime() + n * dayMs).toISOString();

const fx: FxTable = {
  base: "GBP",
  rates: [
    { currency: "USD", perBase: 1.25, asOf: daysAgo(3) },
    { currency: "EUR", perBase: 1.2, asOf: daysAgo(3) },
    { currency: "JPY", perBase: 190, asOf: daysAgo(200) },
  ],
};

/* -------------------------------------------------------------------------- */
/* FX                                                                         */
/* -------------------------------------------------------------------------- */

describe("fx", () => {
  it("converts through the base currency", () => {
    const result = convert(100, "USD", "EUR", fx, NOW);
    expect(result).not.toBeNull();
    // 100 USD = 80 GBP = 96 EUR
    expect(result!.amount).toBeCloseTo(96, 6);
    expect(result!.rate).toBeCloseTo(0.96, 6);
  });

  it("returns null rather than assuming parity when a rate is missing", () => {
    expect(convert(100, "AUD", "GBP", fx, NOW)).toBeNull();
    expect(convert(100, "GBP", "CHF", fx, NOW)).toBeNull();
  });

  it("refuses a non-positive rate on either leg rather than returning zero", () => {
    // A rate mistyped as 0 must fail loudly. Converting *to* it used to slip
    // past the guard and return a confident 0.00, which reads on screen as a
    // real figure — strictly worse than reporting the rate as unset.
    const broken: FxTable = {
      base: "GBP",
      rates: [
        { currency: "USD", perBase: 1.25, asOf: daysAgo(3) },
        { currency: "ZAR", perBase: 0, asOf: daysAgo(3) },
      ],
    };
    expect(convert(100, "USD", "ZAR", broken, NOW)).toBeNull();
    expect(convert(100, "ZAR", "USD", broken, NOW)).toBeNull();
    expect(convert(100, "GBP", "ZAR", broken, NOW)).toBeNull();
  });

  it("treats a cross rate as being as old as its weakest leg", () => {
    const result = convert(1000, "JPY", "USD", fx, NOW);
    expect(result!.stale).toBe(true);
    expect(staleRates(fx, NOW).map((r) => r.currency)).toEqual(["JPY"]);
  });

  it("reports what it could not convert instead of dropping it", () => {
    const total = sumInCurrency(
      [
        { amount: 100, currency: "GBP" },
        { amount: 125, currency: "USD" },
        { amount: 50, currency: "AUD" },
      ],
      "GBP",
      fx,
      NOW,
    );
    expect(total.total).toBeCloseTo(200, 6);
    expect(total.unconverted).toEqual([{ currency: "AUD", amount: 50 }]);
    expect(total.currencies).toEqual(["AUD", "GBP", "USD"]);
  });

  it("labels a conversion with its rate and date", () => {
    const result = convert(1, "USD", "GBP", fx, NOW)!;
    expect(rateLabel(result, "USD", "GBP")).toContain("1 USD = 0.8000 GBP");
  });
});

/* -------------------------------------------------------------------------- */
/* Margin                                                                     */
/* -------------------------------------------------------------------------- */

const products: Product[] = [
  {
    id: "p1",
    sku: "SKU-1",
    name: "Widget",
    unit: "pcs",
    purchasePrice: 8,
    sellingPrice: 12,
    currency: "GBP",
    supplierIds: ["s1"],
    tags: [],
    isActive: true,
    createdAt: daysAgo(100),
    updatedAt: daysAgo(10),
  },
  {
    id: "p2",
    sku: "SKU-2",
    name: "Gadget",
    unit: "pcs",
    currency: "GBP",
    supplierIds: [],
    tags: [],
    isActive: true,
    createdAt: daysAgo(100),
    updatedAt: daysAgo(10),
  },
];

const offers: PricingRecord[] = [
  {
    id: "o1",
    productId: "p1",
    productName: "Widget",
    supplierId: "s1",
    supplierName: "Alpha Supply",
    unitPrice: 7,
    currency: "GBP",
    source: "email",
    status: "approved",
    extractedAt: daysAgo(20),
    createdAt: daysAgo(20),
    updatedAt: daysAgo(20),
  },
  {
    id: "o2",
    productId: "p1",
    productName: "Widget",
    supplierId: "s2",
    supplierName: "Beta Metals",
    unitPrice: 6.5,
    currency: "GBP",
    source: "email",
    status: "approved",
    extractedAt: daysAgo(5),
    createdAt: daysAgo(5),
    updatedAt: daysAgo(5),
  },
  {
    id: "o3",
    productId: "p1",
    productName: "Widget",
    supplierId: "s3",
    supplierName: "Cheap But Unapproved",
    unitPrice: 4,
    currency: "GBP",
    source: "email",
    status: "pending_review",
    extractedAt: daysAgo(1),
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  },
  {
    id: "o4",
    productId: "p1",
    productName: "Widget",
    supplierId: "s4",
    supplierName: "Lapsed Offer Ltd",
    unitPrice: 3,
    currency: "GBP",
    source: "email",
    status: "approved",
    validUntil: daysAgo(2),
    extractedAt: daysAgo(30),
    createdAt: daysAgo(30),
    updatedAt: daysAgo(30),
  },
];

const marginCtx: MarginContext = {
  pricingRecords: offers,
  products,
  fx,
  floorPct: 15,
  now: NOW,
};

const line = (over: Partial<QuotationLine> & { id: string }): QuotationLine => ({
  description: "Widget",
  quantity: 100,
  unitPrice: 10,
  currency: "GBP",
  productId: "p1",
  ...over,
});

describe("margin", () => {
  it("prefers the cheapest live approved offer, ignoring unapproved and lapsed ones", () => {
    const best = bestOfferFor("p1", offers, NOW);
    expect(best?.id).toBe("o2");
  });

  it("measures margin from the offer and names its source", () => {
    const result = documentMargin(
      { lines: [line({ id: "l1" })], currency: "GBP" },
      marginCtx,
    );
    expect(result.confidence).toBe("measured");
    expect(result.lines[0].basis).toBe("offer");
    expect(result.lines[0].sourceSupplier).toBe("Beta Metals");
    expect(result.marginPct).toBe(35);
    expect(result.breaches).toHaveLength(0);
  });

  it("falls back to the standing purchase price and labels the weaker basis", () => {
    const result = documentMargin(
      {
        lines: [line({ id: "l1", productId: "p1" })],
        currency: "GBP",
      },
      { ...marginCtx, pricingRecords: [] },
    );
    expect(result.lines[0].basis).toBe("standing");
    expect(result.lines[0].unitCost).toBe(8);
  });

  it("reports unknown rather than 100% when no cost exists", () => {
    const result = documentMargin(
      { lines: [line({ id: "l1", productId: "p2", description: "Gadget" })], currency: "GBP" },
      marginCtx,
    );
    expect(result.confidence).toBe("unknown");
    expect(result.marginPct).toBeNull();
    expect(result.uncostedLines).toBe(1);
  });

  it("takes the percentage over costed revenue only, so uncosted lines cannot inflate it", () => {
    const result = documentMargin(
      {
        lines: [
          line({ id: "l1" }),
          line({ id: "l2", productId: "p2", description: "Gadget", unitPrice: 50 }),
        ],
        currency: "GBP",
      },
      marginCtx,
    );
    expect(result.confidence).toBe("partial");
    expect(result.marginPct).toBe(35);
    expect(result.coverage).toBeCloseTo(1000 / 6000, 6);
  });

  it("flags a line under the configured floor", () => {
    const result = documentMargin(
      { lines: [line({ id: "l1", unitPrice: 7 })], currency: "GBP" },
      marginCtx,
    );
    expect(result.lines[0].belowFloor).toBe(true);
    expect(result.breaches).toHaveLength(1);
  });

  it("applies the line discount before measuring margin", () => {
    const result = documentMargin(
      { lines: [line({ id: "l1", discountPct: 20 })], currency: "GBP" },
      marginCtx,
    );
    expect(result.revenue).toBe(800);
    expect(result.marginPct).toBe(18.75);
  });

  it("refuses to state a margin when the cost currency has no rate", () => {
    const result = documentMargin(
      { lines: [line({ id: "l1" })], currency: "AUD" },
      marginCtx,
    );
    expect(result.lines[0].marginPct).toBeNull();
    expect(result.lines[0].note).toContain("no GBP→AUD rate");
  });
});

/* -------------------------------------------------------------------------- */
/* Credit                                                                     */
/* -------------------------------------------------------------------------- */

const customer = (over: Partial<Customer> & { id: string }): Customer => ({
  name: "Test Account",
  status: "active",
  segment: "wholesale",
  country: "United Kingdom",
  currency: "GBP",
  tags: [],
  kycStatus: "approved",
  createdAt: daysAgo(300),
  updatedAt: daysAgo(10),
  ...over,
});

const invoice = (over: Partial<Invoice> & { id: string }): Invoice => ({
  number: "INV-1",
  customerId: "c1",
  status: "issued",
  lines: [],
  currency: "GBP",
  subtotal: 1000,
  tax: 0,
  total: 1000,
  issuedAt: daysAgo(60),
  dueAt: daysAgo(30),
  createdAt: daysAgo(60),
  updatedAt: daysAgo(60),
  ...over,
});


/* -------------------------------------------------------------------------- */
/* Price index                                                                */
/* -------------------------------------------------------------------------- */

describe("price index", () => {
  const curveRecords: PricingRecord[] = [
    {
      id: "c1",
      productId: "p1",
      productName: "Widget",
      supplierName: "Alpha Supply",
      unitPrice: 10,
      currency: "GBP",
      source: "email",
      status: "approved",
      extractedAt: daysAgo(80),
      createdAt: daysAgo(80),
      updatedAt: daysAgo(80),
    },
    {
      id: "c2",
      productId: "p1",
      productName: "Widget",
      supplierName: "Alpha Supply",
      unitPrice: 12,
      currency: "GBP",
      source: "email",
      status: "approved",
      extractedAt: daysAgo(10),
      createdAt: daysAgo(10),
      updatedAt: daysAgo(10),
    },
    {
      id: "c3",
      productId: "p1",
      productName: "Widget",
      supplierName: "Beta Metals",
      unitPrice: 9,
      currency: "GBP",
      source: "email",
      status: "approved",
      extractedAt: daysAgo(20),
      createdAt: daysAgo(20),
      updatedAt: daysAgo(20),
    },
  ];

  it("builds an ordered curve and reports the move", () => {
    const curve = priceCurve(products[0], curveRecords, fx, {
      currency: "GBP",
      windowDays: 90,
      now: NOW,
    });
    expect(curve.observations.map((o) => o.offerId)).toEqual(["c1", "c3", "c2"]);
    expect(curve.changePct).toBe(20);
    expect(curve.direction).toBe("rising");
    expect(curve.best?.supplierName).toBe("Beta Metals");
    expect(curve.betterSupplierAvailable).toBe(true);
  });

  it("will not state a direction from a single observation", () => {
    const curve = priceCurve(products[0], [curveRecords[0]], fx, {
      currency: "GBP",
      now: NOW,
    });
    expect(curve.direction).toBe("unknown");
    expect(curve.changePct).toBeNull();
    expect(curve.volatilityPct).toBeNull();
  });

  it("counts observations it could not convert instead of including them at parity", () => {
    const curve = priceCurve(
      products[0],
      [
        ...curveRecords,
        {
          ...curveRecords[0],
          id: "c4",
          currency: "AUD",
          unitPrice: 999,
          extractedAt: daysAgo(1),
        },
      ],
      fx,
      { currency: "GBP", now: NOW },
    );
    expect(curve.excluded).toBe(1);
    expect(curve.latest?.offerId).toBe("c2");
  });

  it("only reports moves above the threshold", () => {
    const curve = priceCurve(products[0], curveRecords, fx, {
      currency: "GBP",
      now: NOW,
    });
    expect(priceMoves([curve], 5)).toHaveLength(1);
    expect(priceMoves([curve], 25)).toHaveLength(0);
  });

  it("ranks suppliers on their latest price", () => {
    const curve = priceCurve(products[0], curveRecords, fx, {
      currency: "GBP",
      now: NOW,
    });
    const spread = supplierSpread(curve);
    expect(spread[0].supplierName).toBe("Beta Metals");
    expect(spread[1].vsBestPct).toBeCloseTo(33.33, 1);
  });
});

/* -------------------------------------------------------------------------- */
/* Signals                                                                    */
/* -------------------------------------------------------------------------- */

const signalInput = (over: Partial<SignalInput> = {}): SignalInput => ({
  customers: [customer({ id: "c1", name: "Brightline Ltd" })],
  suppliers: [],
  products: [],
  invoices: [],
  orders: [],
  quotations: [],
  deliveries: [],
  payments: [],
  pricingRecords: [],
  kycRecords: [],
  documents: [],
  communications: [],
  contacts: [],
  ownDomains: ["thefilmlocation.com"],
  fx: { base: "GBP", rates: [{ currency: "USD", perBase: 1.25, asOf: daysAgo(2) }] },
  reportingCurrency: "GBP",
  marginFloorPct: 15,
  documentExpiryWarningDays: 30,
  followUpReminderDays: 7,
  now: NOW,
  ...over,
});

describe("signals", () => {
  it("raises no credit-control or receivable signal: TFL extends no credit", () => {
    const signals = buildSignals(
      signalInput({
        invoices: [invoice({ id: "i1", number: "INV-88", total: 12_400, dueAt: daysAgo(34) })],
      }),
    );
    expect(signals.some((s) => s.id.startsWith("receivable:"))).toBe(false);
    expect(signals.some((s) => /past due|credit limit|credit control/i.test(s.title))).toBe(false);
    expect(Object.keys(KIND_LABELS)).not.toContain("receivable");
    expect(Object.keys(KIND_LABELS)).not.toContain("credit");
  });

  it("flags a live order against un-cleared KYC", () => {
    const signals = buildSignals(
      signalInput({
        customers: [customer({ id: "c1", kycStatus: "pending" })],
        orders: [
          {
            id: "or1",
            number: "SO-9",
            customerId: "c1",
            status: "confirmed",
            lines: [],
            currency: "GBP",
            subtotal: 8000,
            tax: 0,
            total: 8000,
            createdAt: daysAgo(4),
            updatedAt: daysAgo(4),
          } as Order,
        ],
      }),
    );
    const signal = signals.find((s) => s.id === "kycorder:or1");
    expect(signal?.severity).toBe("high");
  });

  it("does not raise an uninvoiced-goods signal: that was a credit-control rule", () => {
    const signals = buildSignals(
      signalInput({
        orders: [
          {
            id: "or1",
            number: "SO-9",
            customerId: "c1",
            status: "delivered",
            lines: [],
            currency: "GBP",
            subtotal: 4000,
            tax: 0,
            total: 4000,
            createdAt: daysAgo(20),
            updatedAt: daysAgo(2),
          } as Order,
        ],
      }),
    );
    expect(signals.some((s) => s.id.startsWith("uninvoiced:"))).toBe(false);
  });

  it("sorts signals by severity, most severe first", () => {
    const signals = buildSignals(
      signalInput({
        customers: [customer({ id: "c1", kycStatus: "pending" })],
        orders: [
          {
            id: "or1", number: "SO-9", customerId: "c1", status: "confirmed", lines: [],
            currency: "GBP", subtotal: 8000, tax: 0, total: 8000,
            createdAt: daysAgo(4), updatedAt: daysAgo(4),
          } as Order,
        ],
        communications: [
          {
            id: "m1", channel: "email", direction: "inbound", body: "Any update?",
            from: "james@aether.co.uk", customerId: "c1", isReceived: true,
            occurredAt: daysAgo(6), createdAt: daysAgo(6),
          },
        ],
      }),
    );
    expect(signals.length).toBeGreaterThan(1);
    const rank = signals.map((s) => ["critical", "high", "medium", "low"].indexOf(s.severity));
    expect(rank).toEqual([...rank].sort((x, y) => x - y));
  });

  it("chases an inbound message left unanswered for two days", () => {
    const signals = buildSignals(
      signalInput({
        communications: [
          {
            id: "m1",
            channel: "email",
            direction: "inbound",
            body: "Any update?",
            from: "james@aether.co.uk",
            customerId: "c1",
            isReceived: true,
            occurredAt: daysAgo(6),
            createdAt: daysAgo(6),
          },
        ],
      }),
    );
    const signal = signals.find((s) => s.id === "unanswered:customer:c1");
    expect(signal?.severity).toBe("high");
    expect(signal?.title).toContain("6 days");
  });

  it("proposes correspondents missing from the contact database", () => {
    const signals = buildSignals(
      signalInput({
        communications: [
          {
            id: "m1",
            channel: "email",
            direction: "inbound",
            body: "Enquiry",
            from: "buyer@newco.io",
            fromName: "Dana Cole",
            isReceived: true,
            occurredAt: daysAgo(1),
            createdAt: daysAgo(1),
          },
        ],
      }),
    );
    const signal = signals.find((s) => s.id === "contacts:unlinked");
    expect(signal?.detail).toContain("Dana Cole");
    expect(signal?.target).toBe("contacts");
  });

  it("says so plainly when there is nothing to do", () => {
    const signals = buildSignals(signalInput());
    const summary = summariseSignals(signals, "GBP");
    expect(summary.critical).toBe(0);
    expect(briefText(signals, NOW)).toContain("Nothing needs attention");
  });
});
