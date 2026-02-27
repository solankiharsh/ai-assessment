# Lessons and limitations ("What would you do differently?")

- **Director in Breadth**: For well-known subjects the Director can stay in Breadth and never converge (finds many entities, never forces transition to Depth). Add an entity-count threshold to force transition to Depth.
- **PDF extraction**: ~30% of sec.gov litigation PDFs fail to fetch. Workarounds in ADR 006; a managed document retrieval service would be the real fix.
- **Entity resolution**: Heuristic, not ML-based. "Tim Overturf" and "Timothy Overturf" match; "T. Overturf" sometimes does not. Trade-off documented in ADR 005; first improvement would be ML-based resolution with labeled data from production runs.
