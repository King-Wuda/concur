# Receipt fixtures

Two synthetic receipts for exercising the extraction pipeline by hand:

| File | What it tests |
|---|---|
| `till-slip.png` | A Checkers till slip with a per-item discount, a VAT line and a **R250 gift card**. The printed total is R787.26; the amount that should be logged is the R537.26 actually paid. |
| `uber-history.png` | An Uber trip history mixing three trips with a **KFC** and a **Pizza Perfect** order. The trips belong in Transport, the food in Chill — from one image. |

```bash
npm run try:extract
```

Both were rendered from the `.html` files beside them, so they can be edited and
regenerated:

```bash
chromium --headless --screenshot=till-slip.png --window-size=520,640 \
  "file://$PWD/till-slip.html"
```

They are synthetic: the stores are real chains, but the transaction details,
card digits and VAT number are invented.

## What is checked, and what deliberately is not

`npm run compare:models` runs these through several models and reports named
checks. Only rules the brief actually states are asserted:

| Fixture | Checked |
|---|---|
| `till-slip.png` | Total is the **R537.26 paid**, not the R787.26 printed · nappies are Lily · the basket discount is netted off the mince (R104.39) · no subtotal, VAT or change row is treated as a line item |
| `uber-history.png` | Total is R693.30 · trips are **Transport** (R350.30) · the KFC and Pizza Perfect orders are **Chill** (R343.00) |

**The Purity baby food is deliberately not checked.** Tinned baby food bought at
a supermarket is defensibly Groceries and defensibly Lily, and models pick
differently between runs — including the same model twice. An earlier version of
this compared whole category maps against one model's output and so reported
that judgement call as a failure, which measured agreement with a guess rather
than correctness. If a check here ever fails, look at whether the receipt is
genuinely ambiguous before treating it as a regression.

## Measured

Last run, on the checks above:

| Model | Checks | Per receipt | 100 receipts |
|---|---|---|---|
| Claude Opus 5.5 | 7/7 | 7.3s | $2.48 |
| **Claude Sonnet 5.5** (default) | **7/7** | **4.9s** | **$1.13** |
| Claude Haiku 4.5 | 6/7 | 3.4s | $0.34 |

Sonnet matches Opus on every stated rule, faster and at under half the cost.
Haiku is cheaper again but stopped netting the basket discount off the mince —
which is exactly the out-of-pocket rule this app exists to get right, so the
saving is not worth it.

Set `RECEIPT_MODEL` to try another model without a code change.
