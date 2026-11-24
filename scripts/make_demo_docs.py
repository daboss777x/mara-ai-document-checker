"""Realistic, fictitious sample documents for the Mara demo (and the live evals).

Every "good" file meets every rule in its config/standards/<type>.yaml. The "flawed" files
break one or two rules on purpose. Signatures, initials and check marks are drawn as pen
strokes (not typed text), so the checker treats them like real ink.

    uv run --with reportlab python scripts/make_demo_docs.py

Writes demo-docs/*.pdf and the strict eval cases in evals/cases/real_*.{pdf,json}.
All people, companies, addresses and numbers are made up.
"""

from __future__ import annotations

import json
import math
import random
import shutil
from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen.canvas import Canvas

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "demo-docs"
CASES = ROOT / "evals" / "cases"

W, H = letter
M = 60  # page margin
INK = (0.07, 0.17, 0.52)  # blue pen
TYPED = (0.05, 0.05, 0.3)  # filled-in field text

BUYER = "Jordan Avery"
SELLER = "Maria Alvarez"
AGENT = "Rachel Kim"
ADDRESS = "4512 Ridgeview Ln"
CITY = "Austin, TX 78745"


# --- pen strokes -------------------------------------------------------------------


def signature(c: Canvas, x: float, y: float, name: str, width: float = 150, height: float = 22) -> None:
    """A cursive-looking scribble built from the name: one wave per letter, a slant, a flourish."""
    rnd = random.Random(name)
    c.saveState()
    c.setStrokeColorRGB(*INK)
    c.setLineWidth(1.15)
    c.setLineCap(1)
    c.setLineJoin(1)
    letters = [ch for ch in name if ch.isalpha() or ch == " "]
    step = width / max(len(letters), 1)
    slant = 0.32

    def pt(px: float, py: float) -> tuple[float, float]:
        return px + (py - y) * slant, py

    path = c.beginPath()
    cx = x
    prev = pt(cx, y + height * 0.15)
    path.moveTo(*prev)
    for ch in letters:
        if ch == " ":
            cx += step * 0.9
            prev = pt(cx, y + height * rnd.uniform(0.1, 0.4))
            path.moveTo(*prev)
            continue
        tall = ch.isupper() or ch in "bdfhklt"
        top = y + height * (1.0 if ch.isupper() else 0.85 if tall else 0.42) * rnd.uniform(0.85, 1.1)
        low = y - height * (0.45 if ch in "gjpqy" else 0.04) * rnd.uniform(0.6, 1.2)
        for tx, ty in ((cx + step * 0.35, top), (cx + step * 0.75, low)):
            nx, ny = pt(tx, ty)
            path.curveTo(prev[0] + (nx - prev[0]) * 0.5, prev[1], prev[0] + (nx - prev[0]) * 0.5, ny, nx, ny)
            prev = (nx, ny)
        if ch.isupper() and rnd.random() < 0.7:  # a loop on capitals
            lx, ly = prev
            path.curveTo(lx - step * 0.6, ly + height * 0.9, lx + step * 0.9, ly + height * 1.1, lx + step * 0.2, ly + height * 0.2)
            prev = (lx + step * 0.2, ly + height * 0.2)
        cx += step * rnd.uniform(0.85, 1.1)
    # flourish under the name
    fx, fy = prev
    path.curveTo(fx + 10, fy - 6, x + width * 0.55, y - 3, x + width * 0.05, y + 1)
    c.drawPath(path, stroke=1, fill=0)
    c.restoreState()


def initials(c: Canvas, x: float, y: float, name: str) -> None:
    letters = "".join(p[0] for p in name.split())
    signature(c, x, y, letters, width=30, height=15)


def check_mark(c: Canvas, x: float, y: float, size: float = 9) -> None:
    """A hand-drawn X in a box whose lower-left corner is (x, y)."""
    rnd = random.Random(f"{x:.1f},{y:.1f}")
    c.saveState()
    c.setStrokeColorRGB(*INK)
    c.setLineWidth(1.3)
    c.setLineCap(1)
    j = lambda: rnd.uniform(-1.2, 1.2)  # noqa: E731
    c.line(x + 1 + j(), y + 1 + j(), x + size - 1 + j(), y + size - 1 + j())
    c.line(x + 1 + j(), y + size - 1 + j(), x + size - 1 + j(), y + 1 + j())
    c.restoreState()


# --- page furniture -----------------------------------------------------------------


class Doc:
    def __init__(self, path: Path, title: str, form_id: str, pages: int, initials_by: list[str]) -> None:
        self.c = Canvas(str(path), pagesize=letter)
        self.c.setTitle(title)
        self.c.setAuthor("Fictitious sample")
        self.title, self.form_id, self.pages = title, form_id, pages
        self.initials_by = initials_by
        self.page = 0
        self.y = H - M

    def start_page(self, heading: bool = True) -> None:
        self.page += 1
        self.y = H - M
        c = self.c
        if heading:
            c.setFont("Helvetica-Bold", 14)
            c.drawCentredString(W / 2, self.y, self.title)
            self.y -= 14
            c.setFont("Helvetica", 8)
            c.drawCentredString(W / 2, self.y, f"Form {self.form_id}  ·  Sample form for demonstration")
            self.y -= 26

    def end_page(self, missing_initials: bool = False, missing_for: set[str] | None = None) -> None:
        c = self.c
        fy = 46
        c.setStrokeColorRGB(0.6, 0.6, 0.6)
        c.line(M, fy + 22, W - M, fy + 22)
        c.setFont("Helvetica", 8)
        c.setFillColorRGB(0, 0, 0)
        x = M
        for who in self.initials_by:
            label = f"{'Buyer' if who == BUYER else 'Seller'} initials:"
            c.drawString(x, fy + 4, label)
            c.rect(x + 62, fy - 3, 48, 22, stroke=1, fill=0)
            if not (missing_initials and (missing_for is None or who in missing_for)):
                initials(c, x + 68, fy + 1, who)
            x += 130
        c.drawRightString(W - M, fy + 4, f"Page {self.page} of {self.pages}")
        c.setFont("Helvetica-Oblique", 6.5)
        c.setFillColorRGB(0.45, 0.45, 0.45)
        c.drawCentredString(W / 2, 28, "Fictitious sample document. All names, addresses and amounts are made up.")
        c.setFillColorRGB(0, 0, 0)
        c.showPage()

    def save(self) -> None:
        self.c.save()

    # text helpers
    def section(self, text: str) -> None:
        self.c.setFont("Helvetica-Bold", 10)
        self.c.drawString(M, self.y, text)
        self.y -= 15

    def para(self, text: str, size: float = 8.6) -> None:
        self.c.setFont("Helvetica", size)
        for line in simpleSplit(text, "Helvetica", size, W - 2 * M):
            self.c.drawString(M, self.y, line)
            self.y -= size + 3
        self.y -= 6

    def field(self, label: str, value: str | None, x: float | None = None, width: float = 220, newline: bool = True) -> None:
        """Label, an underline, and the filled-in value on it (None = left blank)."""
        c = self.c
        x = M if x is None else x
        c.setFont("Helvetica", 9)
        c.setFillColorRGB(0, 0, 0)
        c.drawString(x, self.y, label)
        lx = x + c.stringWidth(label, "Helvetica", 9) + 6
        c.setStrokeColorRGB(0, 0, 0)
        c.setLineWidth(0.5)
        c.line(lx, self.y - 2, lx + width, self.y - 2)
        if value:
            c.setFont("Helvetica-Oblique", 10)
            c.setFillColorRGB(*TYPED)
            c.drawString(lx + 4, self.y + 1, value)
            c.setFillColorRGB(0, 0, 0)
        if newline:
            self.y -= 22

    def sign_block(self, role: str, name: str, date: str | None, signed: bool = True, x: float | None = None) -> None:
        """Signature line with the pen signature, printed name and date."""
        c = self.c
        x = M if x is None else x
        y = self.y
        c.setStrokeColorRGB(0, 0, 0)
        c.setLineWidth(0.6)
        c.line(x, y, x + 190, y)
        if signed:
            signature(c, x + 12, y + 4, name)
        c.setFont("Helvetica", 8)
        c.drawString(x, y - 11, f"{role}: {name}")
        c.drawString(x + 120, y - 11, "Date:")
        c.line(x + 143, y - 13, x + 205, y - 13)
        if date:
            c.setFont("Helvetica-Oblique", 9.5)
            c.setFillColorRGB(*TYPED)
            c.drawString(x + 146, y - 11, date)
            c.setFillColorRGB(0, 0, 0)


BOILER = [
    "The parties agree that time is of the essence for every date in this agreement. A notice is "
    "effective when delivered in writing to the address or email shown for the receiving party.",
    "This agreement is binding on the parties and their heirs, executors and permitted assigns. It "
    "contains the entire agreement of the parties and may be changed only by a written amendment "
    "signed by all parties.",
    "If any part of this agreement is found to be unenforceable, the rest of it remains in effect. "
    "Headings are for convenience only and do not change the meaning of any paragraph.",
]


# --- documents ----------------------------------------------------------------------


def sales_contract(path: Path, *, buyer_signed=True, buyer_date=True, price=True, initials_missing_page=0) -> None:
    d = Doc(path, "RESIDENTIAL SALES CONTRACT", "CS-RSC-1 (One to Four Family)", 3, [BUYER, SELLER])
    d.start_page()
    d.section("1. PARTIES")
    d.field("Seller:", SELLER, width=200)
    d.field("Buyer:", BUYER, width=200)
    d.para("The Seller agrees to sell and convey to the Buyer, and the Buyer agrees to buy from the Seller, "
           "the property described below.")
    d.section("2. PROPERTY")
    d.field("Street address:", ADDRESS, width=230)
    d.field("City, state, ZIP:", CITY, width=220)
    d.field("County:", "Travis", width=120)
    d.para("Together with all improvements and fixtures on the property, including installed appliances, "
           "window coverings, ceiling fans and landscaping, unless excluded in writing.")
    d.section("3. SALES PRICE")
    d.field("A. Cash portion payable by Buyer at closing:", "$97,000.00" if price else None, width=140)
    d.field("B. Sum of all financing described below:", "$388,000.00" if price else None, width=140)
    d.field("C. Sales price (sum of A and B):", "$485,000.00" if price else None, width=140)
    d.section("4. FINANCING")
    d.para("This contract is subject to the Buyer obtaining a conventional loan for the amount in 3B on "
           "terms no less favorable than those in the Buyer's loan approval. " + BOILER[0])
    d.end_page(initials_missing_page == 1)

    d.start_page(heading=False)
    d.section("5. EARNEST MONEY")
    d.field("Earnest money:", "$5,000.00", width=120)
    d.field("Escrow agent:", "Lakeline Title Co.", width=200)
    d.para("The Buyer will deliver the earnest money to the escrow agent within three days after the "
           "effective date. " + BOILER[1])
    d.section("6. TITLE POLICY AND SURVEY")
    d.para("The Seller will furnish an owner's policy of title insurance in the amount of the sales price. "
           "The Buyer may object in writing to defects in title within the time allowed. " + BOILER[2])
    d.section("7. PROPERTY CONDITION")
    d.para("The Buyer has received the Seller's Disclosure Notice. The Buyer accepts the property in its "
           "present condition, subject to any repairs agreed in writing before closing.")
    d.section("8. CLOSING")
    d.field("Closing date:", "December 19, 2026", width=160)
    d.para("Closing will take place at the offices of the escrow agent. At closing the Seller will deliver "
           "a general warranty deed and the Buyer will pay the sales price.")
    d.section("9. POSSESSION")
    d.para("The Seller will deliver possession to the Buyer at closing and funding, in its present "
           "condition, ordinary wear and tear excepted.")
    d.end_page(initials_missing_page == 2)

    d.start_page(heading=False)
    d.section("10. NOTICES")
    d.field("To Buyer at:", "jordan.avery@example.com", width=220)
    d.field("To Seller at:", "maria.alvarez@example.com", width=220)
    d.section("11. AGREEMENT OF PARTIES")
    d.para("This contract contains the entire agreement of the parties. " + BOILER[1])
    d.y -= 6
    d.section("EXECUTED")
    d.field("Effective date (date of final acceptance):", "November 20, 2026", width=150)
    d.y -= 34
    d.sign_block("Buyer", BUYER, "11/18/2026" if buyer_date else None, signed=buyer_signed)
    d.sign_block("Seller", SELLER, "11/20/2026", x=W / 2 + 10)
    d.y -= 60
    d.para("Broker information: Cedar & Stone Realty, listing and buyer's broker. Agent: Rachel Kim, "
           "license #0723456, (512) 555-0102.")
    d.end_page(initials_missing_page == 3)
    d.save()


def buyer_rep_agreement(path: Path) -> None:
    d = Doc(path, "RESIDENTIAL BUYER REPRESENTATION AGREEMENT", "CS-BRA-2", 2, [BUYER])
    d.start_page()
    d.section("1. PARTIES")
    d.field("Buyer (client):", BUYER, width=210)
    d.field("Broker:", "Cedar & Stone Realty", width=210)
    d.para("The Buyer appoints the Broker as the Buyer's exclusive real estate agent to help the Buyer "
           "find and buy residential property in the market area below.")
    d.field("Market area:", "Travis and Williamson counties, Texas", width=240)
    d.section("2. TERM")
    d.field("This agreement begins on:", "November 1, 2026", width=150)
    d.field("and ends at 11:59 p.m. on:", "April 30, 2027", width=150)
    d.section("3. BROKER'S OBLIGATIONS")
    d.para("The Broker will use reasonable efforts to locate property that meets the Buyer's needs, help "
           "the Buyer negotiate, and keep the Buyer informed. " + BOILER[0])
    d.section("4. BUYER'S OBLIGATIONS")
    d.para("The Buyer will work exclusively through the Broker during the term and tell the Broker about "
           "any property the Buyer is interested in. " + BOILER[2])
    d.end_page()

    d.start_page(heading=False)
    d.section("5. COMPENSATION")
    d.para("The Broker's compensation is described in the separate compensation addendum signed by the "
           "parties. " + BOILER[1])
    d.section("6. ADDITIONAL TERMS")
    d.para("None.")
    d.y -= 40
    d.sign_block("Buyer", BUYER, "11/01/2026")
    d.sign_block("Broker's agent", AGENT, "11/01/2026", x=W / 2 + 10)
    d.y -= 30
    d.c.setFont("Helvetica", 8)
    d.c.drawString(W / 2 + 10, d.y, "for Cedar & Stone Realty, license #9001234")
    d.end_page()
    d.save()


DISCLOSURE_QS = [
    "Is the property equipped with smoke detectors?", "Are you aware of any roof leaks?",
    "Are you aware of any previous foundation repairs?", "Are you aware of termite or wood-destroying insect damage?",
    "Are you aware of any previous flooding into the house?", "Is any part of the property in a 100-year floodplain?",
    "Are you aware of any plumbing leaks?", "Are you aware of any problems with the electrical system?",
    "Are you aware of any mold or water damage?", "Has the house been tested for radon?",
    "Is there a homeowners association?", "Are you aware of any unpaid assessments or liens?",
    "Are you aware of any boundary disputes or encroachments?", "Are you aware of any lawsuits affecting the property?",
    "Is the property served by a septic system?", "Are there any underground storage tanks?",
    "Are you aware of any work done without permits?", "Are you aware of any hail or storm damage repairs?",
]
ANSWERS = "YNNNNNNNNNYNNNNNNY"  # Y / N / U per question


def sellers_disclosure(path: Path, *, unanswered: tuple[int, ...] = ()) -> None:
    d = Doc(path, "SELLER'S DISCLOSURE NOTICE", "CS-SDN-3", 2, [SELLER, BUYER])

    def questions(qs: range) -> None:
        c = d.c
        c.setFont("Helvetica-Bold", 8)
        for i, lab in enumerate(("Yes", "No", "Unknown")):
            c.drawString(W - M - 128 + i * 44, d.y, lab)
        d.y -= 14
        for qi in qs:
            c.setFont("Helvetica", 8.6)
            c.drawString(M, d.y, f"{qi + 1}. {DISCLOSURE_QS[qi]}")
            for i, code in enumerate("YNU"):
                bx = W - M - 124 + i * 44
                c.rect(bx, d.y - 2, 9, 9, stroke=1, fill=0)
                if qi not in unanswered and ANSWERS[qi] == code:
                    check_mark(c, bx, d.y - 2)
            d.y -= 17

    d.start_page()
    d.para("This notice is a disclosure of the Seller's knowledge of the condition of the property as of "
           "the date signed by the Seller. It is not a warranty of any kind by the Seller or the Seller's agents.")
    d.field("Concerning the property at:", f"{ADDRESS}, {CITY}", width=260)
    d.field("Seller has lived in the property since:", "2014", width=80)
    d.section("SECTION 1. CONDITION OF THE PROPERTY")
    questions(range(0, 12))
    d.end_page()

    d.start_page(heading=False)
    d.section("SECTION 1 (continued)")
    questions(range(12, 18))
    d.y -= 4
    d.field("If you answered yes to any item, explain:", "Q18: roof replaced after 2023 hail storm, permit on file.", width=250)
    d.y -= 30
    d.sign_block("Seller", SELLER, "11/10/2026")
    d.y -= 56
    d.section("BUYER'S ACKNOWLEDGEMENT")
    d.para("The undersigned Buyer acknowledges receipt of the foregoing notice.")
    d.field("Date the Buyer received this notice:", "November 12, 2026", width=150)
    d.y -= 26
    d.sign_block("Buyer", BUYER, "11/12/2026")
    d.end_page()
    d.save()


def lead_paint_addendum(path: Path) -> None:
    d = Doc(path, "ADDENDUM FOR SELLER'S DISCLOSURE OF LEAD-BASED PAINT", "CS-LBP-4 (housing built before 1978)", 1, [BUYER, SELLER])
    d.start_page()
    d.field("Concerning the property at:", f"{ADDRESS}, {CITY}", width=260)
    d.para("Every buyer of residential property built before 1978 is told that the property may present "
           "exposure to lead from lead-based paint. The seller must give the buyer any information on "
           "lead-based paint hazards the seller has, and tell the buyer of any known hazards.")
    c = d.c

    def initial_box(label: str, who: str) -> None:
        c.rect(M, d.y - 4, 34, 15, stroke=1, fill=0)
        initials(c, M + 5, d.y, who)
        c.setFont("Helvetica", 8.6)
        c.drawString(M + 42, d.y, label)
        d.y -= 22

    def choice(label: str, on: bool) -> None:
        c.rect(M + 42, d.y - 2, 9, 9, stroke=1, fill=0)
        if on:
            check_mark(c, M + 42, d.y - 2)
        c.setFont("Helvetica", 8.6)
        c.drawString(M + 58, d.y, label)
        d.y -= 16

    d.section("A. SELLER'S DISCLOSURE (seller initials)")
    initial_box("(a) Seller has no knowledge of lead-based paint or hazards in the housing.", SELLER)
    initial_box("(b) Seller has no reports or records about lead-based paint in the housing.", SELLER)
    d.section("B. BUYER'S ACKNOWLEDGEMENT (buyer initials)")
    initial_box("(c) Buyer has received copies of all information listed above.", BUYER)
    initial_box("(d) Buyer has received the pamphlet \"Protect Your Family From Lead in Your Home\".", BUYER)
    initial_box("(e) Buyer has (check one):", BUYER)
    choice("received a 10-day opportunity to conduct a risk assessment or inspection; or", False)
    choice("waived the opportunity to conduct a risk assessment or inspection.", True)
    d.section("C. AGENT'S ACKNOWLEDGEMENT")
    d.para("The agent has informed the seller of the seller's obligations and is aware of the agent's "
           "responsibility to ensure compliance.")
    d.section("D. CERTIFICATION OF ACCURACY")
    d.para("The parties have reviewed the information above and certify, to the best of their knowledge, "
           "that the information they have provided is true and accurate.")
    d.y -= 30
    d.sign_block("Buyer", BUYER, "11/18/2026")
    d.sign_block("Seller", SELLER, "11/20/2026", x=W / 2 + 10)
    d.end_page()
    d.save()


def preapproval_letter(path: Path, *, date: str = "November 18, 2026") -> None:
    c = Canvas(str(path), pagesize=letter)
    c.setTitle("Pre-approval letter")
    y = H - M
    c.setFillColorRGB(0.1, 0.3, 0.25)
    c.rect(M, y - 6, 26, 26, stroke=0, fill=1)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(M + 36, y + 4, "Hill Country Home Lending")
    c.setFont("Helvetica", 8.5)
    c.setFillColorRGB(0.25, 0.25, 0.25)
    c.drawString(M + 36, y - 8, "2201 Mesa Verde Blvd, Suite 300, Austin, TX 78731  ·  (512) 555-0188  ·  loans@hillcountry-lending.example  ·  NMLS #1928374")
    c.setFillColorRGB(0, 0, 0)
    y -= 56
    c.setFont("Helvetica", 10.5)
    c.drawString(M, y, date)
    y -= 30
    for line in (BUYER, "1907 Shoal Creek Dr, Apt 4", "Austin, TX 78705"):
        c.drawString(M, y, line)
        y -= 14
    y -= 14
    c.setFont("Helvetica-Bold", 11)
    c.drawString(M, y, "Re: Mortgage pre-approval")
    y -= 24
    c.setFont("Helvetica", 10.5)
    body = [
        f"Dear {BUYER.split()[0]},",
        "",
        "Congratulations. Based on a review of your application, credit report, income and asset documents, "
        f"you are pre-approved for a conventional home loan of up to $400,000.00 for the purchase of a "
        "primary residence.",
        "",
        "Loan program: 30-year fixed conventional.  Approved loan amount: up to $400,000.00.  "
        "Property type: single-family residence.",
        "",
        "This pre-approval is subject to a satisfactory appraisal, clear title, no material change in your "
        "financial situation, and final underwriting review. It is valid for 90 days from the date of this letter.",
        "",
        "Please contact me with any questions.",
        "",
        "Sincerely,",
    ]
    for para in body:
        for line in simpleSplit(para, "Helvetica", 10.5, W - 2 * M) or [""]:
            c.drawString(M, y, line)
            y -= 14
    y -= 30
    signature(c, M + 6, y + 6, "Daniel Reyes", width=140)
    c.setLineWidth(0.6)
    c.line(M, y, M + 200, y)
    y -= 14
    for line in ("Daniel Reyes, Senior Loan Officer", "NMLS #557201  ·  (512) 555-0191", "Hill Country Home Lending"):
        c.drawString(M, y, line)
        y -= 13
    c.setFont("Helvetica-Oblique", 6.5)
    c.setFillColorRGB(0.45, 0.45, 0.45)
    c.drawCentredString(W / 2, 28, "Fictitious sample document. All names, addresses and amounts are made up.")
    c.showPage()
    c.save()


def hoa_addendum(path: Path) -> None:
    d = Doc(path, "ADDENDUM FOR PROPERTY SUBJECT TO A HOMEOWNERS ASSOCIATION", "CS-HOA-5", 1, [BUYER, SELLER])
    d.start_page()
    d.field("Concerning the property at:", f"{ADDRESS}, {CITY}", width=260)
    d.field("Name of the property owners association:", "Ridgeview Park Homeowners Association", width=230)
    d.field("Regular assessments:", "$85.00 per month", width=140)
    d.field("Transfer fee at closing:", "$250.00", width=100)
    d.section("A. SUBDIVISION INFORMATION")
    d.para("The Seller will obtain the subdivision information (the restrictions, bylaws, rules, and the "
           "current operating budget) and deliver it to the Buyer within 10 days after the effective date. "
           "The Buyer may terminate the contract within 3 days after receiving it.")
    d.section("B. FEES AND DEPOSITS")
    d.para("The Buyer will pay any fees charged by the association for transferring the property, up to the "
           "transfer fee stated above. " + BOILER[0])
    d.section("C. AUTHORIZATION")
    d.para("The Seller authorizes the association to release information about the status of dues and "
           "special assessments to the Buyer and the title company.")
    d.y -= 30
    d.sign_block("Buyer", BUYER, "11/18/2026")
    d.sign_block("Seller", SELLER, "11/20/2026", x=W / 2 + 10)
    d.end_page()
    d.save()


# --- build --------------------------------------------------------------------------

GOOD = [
    ("01-buyer-rep-agreement.pdf", "buyer_rep_agreement", buyer_rep_agreement, {}),
    ("02-sales-contract.pdf", "sales_contract", sales_contract, {}),
    ("03-sellers-disclosure.pdf", "sellers_disclosure", sellers_disclosure, {}),
    ("04-lead-paint-addendum.pdf", "lead_paint_addendum", lead_paint_addendum, {}),
    ("05-preapproval-letter.pdf", "preapproval_letter", preapproval_letter, {}),
    ("06-hoa-addendum.pdf", "hoa_addendum", hoa_addendum, {}),
]
FLAWED = [
    ("FIX-sales-contract-no-buyer-signature.pdf", "sales_contract", sales_contract,
     {"buyer_signed": False, "buyer_date": False}, ["buyer_signature", "buyer_signed_date"]),
    ("FIX-sales-contract-missing-initials-page-2.pdf", "sales_contract", sales_contract,
     {"initials_missing_page": 2}, ["initials_each_page"]),
    ("FIX-sales-contract-blank-price.pdf", "sales_contract", sales_contract, {"price": False}, ["sales_price"]),
    ("FIX-sellers-disclosure-unanswered.pdf", "sellers_disclosure", sellers_disclosure,
     {"unanswered": (3, 8, 14)}, ["checklist_answered"]),
    ("FIX-preapproval-letter-expired.pdf", "preapproval_letter", preapproval_letter,
     {"date": "June 2, 2026"}, ["letter_date"]),
]


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name, dtype, build, kw in GOOD:
        build(OUT / name, **kw)
        stem = f"real_good_{dtype}"
        shutil.copy(OUT / name, CASES / f"{stem}.pdf")
        (CASES / f"{stem}.json").write_text(json.dumps(
            {"document_type": dtype, "expect_flagged": [], "strict": True}, indent=2) + "\n")
    for name, dtype, build, kw, expect in FLAWED:
        build(OUT / name, **kw)
        stem = "real_" + name.removeprefix("FIX-").removesuffix(".pdf").replace("-", "_")
        shutil.copy(OUT / name, CASES / f"{stem}.pdf")
        (CASES / f"{stem}.json").write_text(json.dumps(
            {"document_type": dtype, "expect_flagged": expect, "strict": True}, indent=2) + "\n")
    print(f"wrote {len(GOOD) + len(FLAWED)} PDFs to {OUT.relative_to(ROOT)}/ and evals/cases/real_*")


if __name__ == "__main__":
    main()
