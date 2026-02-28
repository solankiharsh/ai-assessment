"""
Evaluation dataset — ground truth for measuring agent performance.

Three test personas at increasing difficulty:
  1. Easy: Well-known public figure with abundant information
  2. Medium: Mid-visibility executive with deeper corporate structures
  3. Hard: Timothy Overturf, CEO of Sisu Capital (the actual assessment target)

Each persona includes expected facts the agent should discover, scored by difficulty.
"""

from __future__ import annotations

from dataclasses import dataclass, field


def _depth_from_difficulty(difficulty: str) -> int:
    """Map difficulty string to depth 1-5 for scoring."""
    m = {"surface": 1, "moderate": 2, "deep": 3, "hidden": 4}
    return m.get(difficulty.lower(), 3)


@dataclass
class ExpectedFact:
    """A single fact the agent should discover."""

    claim: str
    category: str  # biographical, corporate, financial, legal, network, digital
    difficulty: str  # surface, moderate, deep, hidden
    source_hint: str = ""  # Where this fact can typically be found
    weight: float = 1.0  # Importance weighting for scoring
    depth: int = 0  # 1-5; 0 = derive from difficulty (surface=1, moderate=2, deep=3, hidden=4)
    search_keywords: list[str] = field(default_factory=list)  # Optional keywords for matching

    def effective_depth(self) -> int:
        return self.depth if self.depth >= 1 else _depth_from_difficulty(self.difficulty)


@dataclass
class TestPersona:
    """A test persona with ground-truth evaluation data."""

    name: str
    current_role: str
    current_org: str
    difficulty: str  # easy, medium, hard
    description: str
    expected_facts: list[ExpectedFact] = field(default_factory=list)
    expected_entities: list[str] = field(default_factory=list)
    expected_risk_flags: list[str] = field(default_factory=list)
    # (source, target, rel)
    expected_connections: list[tuple[str, str, str]] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════
# Persona 1: Easy — Well-known tech figure
# ═══════════════════════════════════════════════════════════

PERSONA_EASY = TestPersona(
    name="Jensen Huang",
    current_role="CEO",
    current_org="NVIDIA",
    difficulty="easy",
    description="Highly public tech CEO, abundant information across all categories",
    expected_facts=[
        ExpectedFact(
            "Born February 17, 1963 in Tainan, Taiwan",
            "biographical",
            "surface",
            "Wikipedia",
        ),
        ExpectedFact("Co-founded NVIDIA in 1993", "corporate", "surface", "Company website"),
        ExpectedFact(
            "Holds BSEE from Oregon State University",
            "biographical",
            "surface",
            "Wikipedia",
        ),
        ExpectedFact(
            "Holds MSEE from Stanford University",
            "biographical",
            "surface",
            "Wikipedia",
        ),
        ExpectedFact(
            "Worked at LSI Logic and AMD before NVIDIA",
            "biographical",
            "moderate",
            "News articles",
        ),
        ExpectedFact(
            "NVIDIA market cap exceeded $3 trillion in 2024",
            "financial",
            "surface",
            "Financial news",
        ),
        ExpectedFact(
            "Board member at various organizations",
            "network",
            "moderate",
            "SEC filings",
        ),
        ExpectedFact("Known for leather jacket trademark style", "digital", "surface", "Media"),
        ExpectedFact(
            "NVIDIA pivoted from gaming to AI computing",
            "corporate",
            "moderate",
            "Business analysis",
        ),
        ExpectedFact("Recipient of multiple industry awards", "biographical", "moderate", "News"),
    ],
    expected_entities=[
        "NVIDIA",
        "Stanford University",
        "Oregon State University",
        "LSI Logic",
        "AMD",
        "TSMC",
    ],
    expected_risk_flags=[],
    expected_connections=[
        ("Jensen Huang", "NVIDIA", "FOUNDED"),
        ("Jensen Huang", "Stanford University", "PREVIOUSLY_AT"),
    ],
)


# ═══════════════════════════════════════════════════════════
# Persona 2: Medium — PE/VC fund manager
# ═══════════════════════════════════════════════════════════

PERSONA_MEDIUM = TestPersona(
    name="Michael Moritz",
    current_role="Partner",
    current_org="Sequoia Capital",
    difficulty="medium",
    description="Well-known VC but with deeper corporate structure and philanthropy to trace",
    expected_facts=[
        ExpectedFact("Born in Cardiff, Wales", "biographical", "surface", "Wikipedia"),
        ExpectedFact(
            "Former journalist at Time magazine",
            "biographical",
            "moderate",
            "News archives",
        ),
        ExpectedFact(
            "Led investments in Google, Yahoo, PayPal, LinkedIn",
            "financial",
            "surface",
            "Sequoia",
        ),
        ExpectedFact(
            "Knight Commander of the Order of the British Empire (KBE)",
            "biographical",
            "moderate",
            "UK honors",
        ),
        ExpectedFact(
            "Major philanthropic donations through Crankstart Foundation",
            "financial",
            "deep",
            "Tax filings",
        ),
        ExpectedFact("Married to Harriet Heyman", "biographical", "moderate", "Society pages"),
        ExpectedFact(
            "Diagnosed with rare medical condition, stepped back from active role",
            "biographical",
            "deep",
            "News",
        ),
        ExpectedFact(
            "Author of 'The Little Kingdom' about Apple Computer",
            "digital",
            "moderate",
            "Publishing records",
        ),
        ExpectedFact("Oxford University education", "biographical", "surface", "Wikipedia"),
        ExpectedFact("Wharton MBA", "biographical", "surface", "Wikipedia"),
    ],
    expected_entities=[
        "Sequoia Capital",
        "Google",
        "Yahoo",
        "PayPal",
        "LinkedIn",
        "Crankstart Foundation",
        "Time Magazine",
        "Oxford University",
    ],
    expected_risk_flags=[],
    expected_connections=[
        ("Michael Moritz", "Sequoia Capital", "WORKS_AT"),
        ("Michael Moritz", "Crankstart Foundation", "FOUNDED"),
        ("Sequoia Capital", "Google", "INVESTED_IN"),
    ],
)


# ═══════════════════════════════════════════════════════════
# Persona 3: Hard — The actual assessment target (Timothy Overturf)
# ═══════════════════════════════════════════════════════════
# Populated with representative expected facts/entities so the evaluation
# harness can run. Candidate should extend with manually verified ground
# truth from pre-research (SEC, court records, LinkedIn, company site).

PERSONA_HARD = TestPersona(
    name="Timothy Overturf",
    current_role="CEO",
    current_org="Sisu Capital",
    difficulty="hard",
    description="Lower-profile finance executive — tests deep research capability",
    expected_facts=[
        ExpectedFact("CEO of Sisu Capital", "corporate", "surface", "Company website/LinkedIn"),
        ExpectedFact(
            "Professional background in finance or investment management",
            "biographical",
            "surface",
            "LinkedIn",
        ),
        ExpectedFact(
            "Sisu Capital is an investment or asset management firm",
            "corporate",
            "surface",
            "Company website",
        ),
        ExpectedFact("LinkedIn profile or professional presence", "digital", "surface", "LinkedIn"),
        ExpectedFact("Any prior executive or board roles", "network", "moderate", "SEC filings, news"),
        ExpectedFact("Education or credentials if publicly stated", "biographical", "moderate", "LinkedIn, press"),
        ExpectedFact("Fund strategy or AUM if disclosed", "financial", "deep", "Regulatory filings"),
        ExpectedFact(
            "Regulatory registrations or filings for Sisu Capital",
            "corporate",
            "deep",
            "SEC, state regulators",
        ),
        # Deep/hidden facts aligned with SEC and regulatory record (depth 4-5)
        ExpectedFact(
            "SEC enforcement or civil action against Sisu Capital or Timothy Overturf",
            "legal",
            "hidden",
            "SEC.gov litigation releases",
            depth=4,
            search_keywords=["SEC", "Sisu Capital", "enforcement", "3:23-cv", "03855"],
        ),
        ExpectedFact(
            "Hansueli Overturf or Hans Overturf connected to Sisu Capital or Timothy",
            "network",
            "hidden",
            "SEC complaint, DFPI orders",
            depth=4,
            search_keywords=["Hansueli Overturf", "Hans Overturf", "Sisu Capital"],
        ),
        ExpectedFact(
            "Fiduciary duty breach or Investment Advisers Act violation",
            "legal",
            "hidden",
            "SEC complaint",
            depth=5,
            search_keywords=["fiduciary", "Investment Advisers Act", "206(1)", "206(2)"],
        ),
        ExpectedFact(
            "California DFPI or state regulatory action or suspension",
            "legal",
            "hidden",
            "DFPI/DBO orders",
            depth=5,
            search_keywords=["DFPI", "California", "suspension", "desist", "Overturf"],
        ),
        ExpectedFact(
            "Sisu Capital registered investment adviser or RIA",
            "corporate",
            "deep",
            "SEC IAPD, Form ADV",
            depth=3,
            search_keywords=["Sisu Capital", "RIA", "investment adviser", "ADV"],
        ),
        ExpectedFact(
            "Northern District of California or N.D. Cal. court case",
            "legal",
            "hidden",
            "PACER, SEC litigation release",
            depth=5,
            search_keywords=["Northern District", "3:2023-cv", "San Francisco"],
        ),
        ExpectedFact(
            "Client account misuse or self-dealing or unsuitable trading",
            "legal",
            "hidden",
            "SEC complaint allegations",
            depth=5,
            search_keywords=["self-dealing", "unsuitable", "client accounts", "disgorgement"],
        ),
    ],
    expected_entities=[
        "Sisu Capital",
        "Timothy Overturf",
        "Hansueli Overturf",
        "Hans Overturf",
    ],
    expected_risk_flags=["SEC", "regulatory", "litigation", "fiduciary"],
    expected_connections=[
        ("Timothy Overturf", "Sisu Capital", "WORKS_AT"),
        ("Timothy Overturf", "Sisu Capital", "FOUNDED"),
        ("Hansueli Overturf", "Timothy Overturf", "FAMILY_OF"),
    ],
)


# ═══════════════════════════════════════════════════════════
# Persona: Easy — Sam Altman (OpenAI)
# ═══════════════════════════════════════════════════════════

PERSONA_EASY_SAM = TestPersona(
    name="Sam Altman",
    current_role="CEO",
    current_org="OpenAI",
    difficulty="easy",
    description="High-profile tech CEO, abundant public information",
    expected_facts=[
        ExpectedFact("Co-founded Loopt, sold to Green Dot", "corporate", "moderate", "Tech news"),
        ExpectedFact("President of Y Combinator (2014–2019)", "corporate", "surface", "YC, Wikipedia"),
        ExpectedFact("CEO of OpenAI", "corporate", "surface", "OpenAI website"),
        ExpectedFact("Studied at Stanford University (dropped out)", "biographical", "surface", "Wikipedia"),
        ExpectedFact("Led OpenAI through ChatGPT release and partnership with Microsoft", "corporate", "surface", "News"),
        ExpectedFact("Worldcoin / Tools for Humanity involvement", "corporate", "moderate", "News"),
        ExpectedFact("Testified before US Congress on AI regulation", "legal", "surface", "Congress, news"),
    ],
    expected_entities=[
        "OpenAI",
        "Y Combinator",
        "Stanford University",
        "Microsoft",
        "Loopt",
        "Worldcoin",
    ],
    expected_risk_flags=[],
    expected_connections=[
        ("Sam Altman", "OpenAI", "CEO"),
        ("Sam Altman", "Y Combinator", "PRESIDENT"),
    ],
)


# ═══════════════════════════════════════════════════════════
# Persona: Medium — Adam Neumann (WeWork)
# ═══════════════════════════════════════════════════════════

PERSONA_MEDIUM_ADAM = TestPersona(
    name="Adam Neumann",
    current_role="Co-founder, former CEO",
    current_org="WeWork",
    difficulty="medium",
    description="High-visibility executive with corporate governance and fall from grace narrative",
    expected_facts=[
        ExpectedFact("Co-founded WeWork with Miguel McKelvey", "corporate", "surface", "WeWork, news"),
        ExpectedFact("WeWork attempted IPO in 2019, valuation collapsed", "financial", "surface", "SEC, news"),
        ExpectedFact("Stepped down as WeWork CEO in 2019", "corporate", "surface", "News"),
        ExpectedFact("SoftBank was major investor in WeWork", "financial", "surface", "News"),
        ExpectedFact("Israeli-American, served in Israeli Navy", "biographical", "moderate", "Wikipedia, interviews"),
        ExpectedFact("Founded Flow (real estate) and received investment from a16z", "corporate", "moderate", "News"),
        ExpectedFact("WeWork filed for bankruptcy in 2023", "corporate", "surface", "News"),
        ExpectedFact("Controversy over self-dealing and governance at WeWork", "legal", "deep", "SEC, news"),
    ],
    expected_entities=[
        "WeWork",
        "SoftBank",
        "Flow",
        "Miguel McKelvey",
        "Andreessen Horowitz",
    ],
    expected_risk_flags=["governance", "IPO", "valuation"],
    expected_connections=[
        ("Adam Neumann", "WeWork", "CO_FOUNDED"),
        ("Adam Neumann", "WeWork", "CEO"),
        ("SoftBank", "WeWork", "INVESTED_IN"),
    ],
)


# ═══════════════════════════════════════════════════════════
# Evaluation Set Registry
# ═══════════════════════════════════════════════════════════

ALL_PERSONAS = [
    PERSONA_EASY,
    PERSONA_EASY_SAM,
    PERSONA_MEDIUM,
    PERSONA_MEDIUM_ADAM,
    PERSONA_HARD,
]

# Difficulty shortcut -> first persona at that difficulty (for --persona easy/medium/hard)
PERSONA_BY_DIFFICULTY = {
    "easy": PERSONA_EASY,
    "medium": PERSONA_MEDIUM,
    "hard": PERSONA_HARD,
}


def get_persona(name: str) -> TestPersona | None:
    """Look up a test persona by name or by difficulty (easy / medium / hard)."""
    key = name.strip().lower()
    if key in PERSONA_BY_DIFFICULTY:
        return PERSONA_BY_DIFFICULTY[key]
    for p in ALL_PERSONAS:
        if p.name.lower() == key:
            return p
    return None
