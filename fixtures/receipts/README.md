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

## What a good run looks like

Recorded from a real run, as the behaviour to compare against if the prompt in
`src/lib/extract.ts` is ever changed.

**`till-slip.png`** — total `R537.26`, not the `R787.26` printed on the slip.
The gift card comes back as its own `-R250.00` line, the Xtra Savings discount
is netted off the mince, and the subtotal, VAT and change rows are left out. The
nappies and the Purity are filed under Lily rather than Groceries, and the notes
field says so, so it can be corrected in the review screen if that is wrong:

```
Groceries      R129.33
Lily           R407.93
TOTAL          R537.26   (reconciles with the receipt total)
```

**`uber-history.png`** — one screenshot, split down the middle by the rule that
matters: the trips are Transport, the food delivery is Chill.

```
Transport      R350.30    3 UberX trips
Chill          R343.00    Pizza Perfect + KFC Streetwise
TOTAL          R693.30   (reconciles with the receipt total)
```

Reading a receipt took 5-12 seconds, well inside the 60-second limit on
`/api/extract`.
