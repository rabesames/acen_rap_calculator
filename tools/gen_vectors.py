"""Independent reference for the ACEN RAP calculations (brief section 5).
Generates fixtures/calc-vectors.json. All inputs are SYNTHETIC numbers invented
for testing. They are not Meralco rates and must never be used as defaults."""
import json
from decimal import Decimal as D, getcontext
getcontext().prec = 28

OFFER = {"discountA": "0.20", "fixedB": "6.25", "termYears": 2}
A, B = D(OFFER["discountA"]), D(OFFER["fixedB"])

def q(x, p="0.01"):
    return float(D(x).quantize(D(p)))

def month(m):
    k, G, V = D(m["importKwh"]), D(m["genRate"]), D(m["vatRate"])
    xk, E = D(m.get("exportKwh", "0")), D(m.get("exportRate", "0"))
    out = {
        "period": m["period"],
        "expectedGenAmount": q(k * G),
        "aBeforeVat": q(A * G * k),
        "aInclVat": q(A * G * k * (1 + V)),
        "bConservative": q((G - B) * k),
        "bVatOnTop": q((G - B) * k * (1 + V)),
        "bVatInside": q(G * k * (1 + V) - B * k),
        "bBeatsA": G > B / (1 - A),
        "creditsLost": q(xk * E),
    }
    if xk > 0:
        out["exportShare"] = q(xk / k, "0.0001")
        out["breakEvenShareA"] = q(A * G / E, "0.0001")
        out["breakEvenShareB"] = q((G - B) / E, "0.0001")
    return out

KEYS = ["aBeforeVat", "aInclVat", "bConservative", "bVatOnTop", "bVatInside", "creditsLost"]

def case(name, note, months):
    rows = [month(m) for m in months]
    n = len(rows)
    tot = {k: q(sum(D(str(r[k])) for r in rows)) for k in KEYS}
    tot["importKwh"] = q(sum(D(m["importKwh"]) for m in months))
    scale = D(12) / D(n)
    ann = {k: q(D(str(tot[k])) * scale) for k in KEYS}
    net = {k: q(D(str(tot[k])) - D(str(tot["creditsLost"]))) for k in KEYS if k != "creditsLost"}
    netAnn = {k: q(D(str(v)) * scale) for k, v in net.items()}
    last = months[-1]
    latest = [month({**m, "genRate": last["genRate"], "vatRate": last["vatRate"],
                     "exportRate": last.get("exportRate", "0")}) for m in months]
    latestAnn = {k: q(sum(D(str(r[k])) for r in latest) * scale) for k in KEYS}
    return {"name": name, "note": note, "input": months,
            "expected": {"months": rows, "monthsUsed": n,
                         "monthsBAboveCrossover": sum(r["bBeatsA"] for r in rows),
                         "totals": tot, "annualised": ann,
                         "netOfCredits": net, "netOfCreditsAnnualised": netAnn,
                         "annualisedAtLatestRates": latestAnn}}

cases = [
 case("no-solar-mixed-rates", "Rates above the crossover, between 6.25 and the crossover, and below 6.25 (negative B month kept in total).",
  [{"period":"2026-01","importKwh":"412","genRate":"8.4120","vatRate":"0.12"},
   {"period":"2026-02","importKwh":"388","genRate":"7.1055","vatRate":"0.12"},
   {"period":"2026-03","importKwh":"455","genRate":"5.9800","vatRate":"0.12"}]),
 case("solar-heavy-export", "Exports large enough that joining loses money under both options.",
  [{"period":"2026-04","importKwh":"210","genRate":"7.9500","vatRate":"0.12","exportKwh":"180","exportRate":"6.1000"},
   {"period":"2026-05","importKwh":"260","genRate":"8.2000","vatRate":"0.12","exportKwh":"150","exportRate":"6.4500"}]),
 case("solar-light-export", "Small exports; joining still comes out ahead.",
  [{"period":"2026-06","importKwh":"640","genRate":"8.6000","vatRate":"0.12","exportKwh":"40","exportRate":"6.3000"}]),
 case("edge-rate-equals-fixed", "G exactly 6.25: B conservative is zero; VAT-inside case still positive. Non-12% VAT to prove V is read, not assumed.",
  [{"period":"2026-07","importKwh":"300","genRate":"6.2500","vatRate":"0.1085"}]),
 case("edge-rate-at-crossover", "G exactly 7.8125: A before VAT equals B conservative; bBeatsA is false (strictly above only).",
  [{"period":"2026-08","importKwh":"500","genRate":"7.8125","vatRate":"0.12"}]),
]
doc = {"_readme": "SYNTHETIC test inputs, invented for testing. Not Meralco rates. Never use as defaults or placeholders in the UI.",
       "offer": OFFER, "crossoverRate": float(B / (1 - A)),
       "moneyTolerance": 0.01, "cases": cases}
import os; os.makedirs("fixtures", exist_ok=True)
json.dump(doc, open("fixtures/calc-vectors.json", "w"), indent=1)
for c in cases:
    print(c["name"], c["expected"]["totals"], c["expected"]["netOfCredits"])
