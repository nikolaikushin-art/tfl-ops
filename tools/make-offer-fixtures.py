"""Builds realistic, messy price-list fixtures (xlsx, pdf, csv) for the offer-reader tests.
Run: python3 tools/make-offer-fixtures.py   (needs openpyxl + reportlab)"""
import os
from openpyxl import Workbook
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas

OUT = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "__fixtures__", "offers")
os.makedirs(OUT, exist_ok=True)

# ---- 1. Excel: letterhead, terms in header + footer, section headings, EUR and USD columns -------------
wb = Workbook(); ws = wb.active; ws.title = "Stock list"
ws.append(["HIGHLAND & ISLAND SPIRITS LTD"])
ws.append(["STOCK LIST - 05 OCT 2026"])
ws.append(["All prices per case. T2 bonded. FCA Rotterdam. Valid until 12/10/2026. Payment: 100% prepayment or escrow"])
ws.append([])
ws.append(["Brand", "Product", "Size", "Btl/Cs", "Cases avail", "Price EUR/case", "Price USD/case", "Old price EUR", "Remarks"])
ws.append(["CHAMPAGNE - STOCK IN REIMS - T1"])
ws.append(["Moet & Chandon", "Imperial Brut NV", "75cl", 6, 1200, 238.5, 262.0, 251.0, "in gift box"])
ws.append(["Veuve Clicquot", "Yellow Label Brut", "75cl", 6, 800, 265.0, 291.5, None, None])
ws.append([])
ws.append(["WHISKY - STOCK IN DUNDEE - T2"])
ws.append(["Brand", "Product", "Size", "Btl/Cs", "Cases avail", "Price EUR/case", "Price USD/case", "Old price EUR", "Remarks"])  # repeated header
ws.append(["Johnnie Walker", "Black Label 12yo", "1L", 12, 500, "€ 1.245,00", None, None, "FCA Antwerp"])
ws.append(["Glenfiddich", "12 Year Old", "70cl", 6, 300, 312.0, 342.0, None, "EXW Dundee"])
ws.append(["Macallan", "12 Double Cask", "70cl", 6, None, "POA", None, None, "limited"])
ws.append([None, "Total cases", None, None, 2800])
ws.append([])
ws.append(["Prices are EXW Dundee unless stated. Subject to availability. Bank: IBAN GB12 XXXX 0000 1111"])
ws2 = wb.create_sheet("Notes"); ws2.append(["Terms and conditions"]); ws2.append(["Goods remain under bond until payment clears."])
wb.save(os.path.join(OUT, "highland-stock-list.xlsx"))

# ---- 2. Excel: no header currency, two header-less terms, European decimals in text, EAN, bottles price --
wb = Workbook(); ws = wb.active; ws.title = "Offer"
ws.append(["Offer to The Film Location - Ref 4471"])
ws.append(["Incoterm: DAP Antwerp   Duty: T1   Currency: EUR   Validity: 30 Nov 2026"])
ws.append([])
ws.append(["EAN", "Description", "Qty (cs)", "Unit price per bottle", "Lead time"])
ws.append(["5000267014203", "Johnnie Walker Black 12x1L", 400, "21,90", "5 days"])
ws.append(["5010327000145", "Glenlivet 12yo 6x70cl", 150, "24,40", "1 week"])
ws.append(["3185370000000", "Hennessy VS 6x70cl", 90, "19,75", "10 days"])
wb.save(os.path.join(OUT, "offer-4471-bottle-price.xlsx"))

# ---- 3. PDF: table, terms banner at top, terms in footer, wide column gaps, two currency columns --------
def pdf_table(path):
    c = canvas.Canvas(path, pagesize=landscape(A4)); W, H = landscape(A4)
    c.setFont("Helvetica-Bold", 14); c.drawString(40, H-40, "NORDIC SPIRITS TRADING AB - PRICE LIST WEEK 40")
    c.setFont("Helvetica", 9)
    c.drawString(40, H-58, "Stock in Gothenburg bonded warehouse. T2. All prices per case in EUR unless shown. Valid until 09.10.2026")
    cols = [40, 250, 330, 380, 450, 540, 640]
    heads = ["Product", "Size", "Btl/Cs", "Cases", "EUR/case", "USD/case", "Notes"]
    y = H-90; c.setFont("Helvetica-Bold", 9)
    for x, h in zip(cols, heads): c.drawString(x, y, h)
    c.setFont("Helvetica", 9)
    rows = [
        ("Absolut Vodka Blue 40%", "1L", "12", "1,000", "78.00", "85.50", ""),
        ("Absolut Vodka Blue 40%", "70cl", "6", "600", "41.20", "45.20", "gift box"),
        ("Jameson Irish Whiskey", "1L", "12", "250", "112.00", "123.00", ""),
        ("Bacardi Carta Blanca", "1L", "12", "400", "70.90", "77.80", "EXW Gothenburg"),
    ]
    for r in rows:
        y -= 16
        for x, v in zip(cols, r): c.drawString(x, y, v)
    c.drawString(40, 60, "Page 1 of 1")
    c.drawString(40, 46, "Prices FCA Gothenburg. Payment: prepayment. Prices exclude any duty or tax.")
    c.save()
pdf_table(os.path.join(OUT, "nordic-price-list.pdf"))

# ---- 4. PDF: running text offer, mixed currencies per line, no table ------------------------------------
c = canvas.Canvas(os.path.join(OUT, "running-text-offer.pdf"), pagesize=A4); W, H = A4
c.setFont("Helvetica", 10); y = H-50
for line in [
    "Dear Roni,",
    "Please find our best offers for this week, goods under bond (T2), FCA Antwerp:",
    "",
    "Johnnie Walker Black Label 12x1L - EUR 24.50 per btl - 500 cs",
    "Hennessy VS 6x70cl - USD 198.00 per case - 120 cs",
    "Chivas Regal 12yo 12x1L - 19,80 EUR/btl - 300 cs - T1",
    "Offer valid until 15 Oct 2026. Payment: escrow.",
    "Kind regards, Marc",
]:
    c.drawString(50, y, line); y -= 16
c.save()

# ---- 5. CSV: semicolon, European decimals, T1/T2 in header (undecided), BOM ------------------------------
open(os.path.join(OUT, "semicolon-list.csv"), "w", encoding="utf-8-sig").write(
"Produkt;Menge;Preis EUR;Duty;Lieferort\n"
"Jägermeister 35% 1L 12x;800;98,50;T1/T2;Hamburg\n"
"Ballantine's Finest 12x1L;600;71,20;T2;Hamburg\n"
)
print("fixtures written to", os.path.abspath(OUT))
