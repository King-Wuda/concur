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
