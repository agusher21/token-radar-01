# Token Radar

A token launch radar for make.fun's `token-radar-01` bounty. It reads a sealed
DefiLlama snapshot of the protocol universe and ranks every pre-token protocol
by what its launch would be worth, each with the steps to farm it.

## The model (radar-comps-1)

Implied value follows only from the snapshot's own figures, through comparables
the snapshot itself supplies:

```
comparable = median(mcap_usd / tvl_usd) over live-token protocols in the same
             category (at least 3 of them, else the global median)
multiple   = clamp(0.5 * comparable + 0.5 * global median, 0.05, 0.80)
growth     = 1 + clamp(change_7d, -50, 150) / 100 * 0.6
maturity   = 0.6 + min(age_days, 1095) / 1095 * 0.4   (age unknown: 365 days)
implied    = max(1, round(tvl_usd * multiple * growth * maturity))
```

The multiple is what the market already pays for a dollar of TVL in that line
of business. Wrapped, staked and bridged products are excluded from the
ranking (they are not launches of their own), and live-token protocols are set
aside with their market caps shown — they are also the comparables.

No protocol name is special-cased: the same function scores every row.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path to snapshot.json>
```

`main.ts` (Node 22, standard library only) writes `board.json`, `data.js`,
copies `dashboard/` and `screenshots/` to the output directory, and writes
`dossier.json` with the vendored make.fun library. It runs twice with
identical bytes.

## The dashboard

`dashboard/` is a static page with no network: a sortable, filterable board,
a detail view for every protocol (model breakdown + farm plan), a live-token
view, and the comparables table. `screenshots/` holds the board, a detail
view and a filtered view.
