"""An independent computation of the statistics in docs/specs/runner.md, used as an oracle.

Student's t comes from its CDF, through the regularized incomplete beta function (Lentz's
continued fraction) and bisection, so neither the table nor the Cornish-Fisher expansion in
packages/core/src/runner/stats.ts can hide a wrong digit. Wilson intervals and summaries are
written from their formulas. packages/core/src/runner/stats.oracle.test.ts runs it and compares
every case with @eb/core.

Run it yourself:  python3 -I docs/specs/stats_oracle.py
"""

import json
import math

Z95 = 1.959963984540054


def betacf(a, b, x):
    tiny = 1e-300
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c, d = 1.0, 1.0 - qab * x / qap
    d = 1.0 / (d if abs(d) > tiny else tiny)
    h = d
    for m in range(1, 500):
        m2 = 2 * m
        for aa in (m * (b - m) * x / ((qam + m2) * (a + m2)), -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))):
            d = 1.0 + aa * d
            d = 1.0 / (d if abs(d) > tiny else tiny)
            c = 1.0 + aa / c
            c = c if abs(c) > tiny else tiny
            h *= d * c
        if abs(d * c - 1.0) < 1e-16:
            return h
    raise RuntimeError("the continued fraction did not converge")


def betai(a, b, x):
    if x <= 0:
        return 0.0
    if x >= 1:
        return 1.0
    front = math.exp(math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) + a * math.log(x) + b * math.log(1 - x))
    if x < (a + 1) / (a + b + 2):
        return front * betacf(a, b, x) / a
    return 1.0 - front * betacf(b, a, 1 - x) / b


def t_cdf(t, df):
    tail = 0.5 * betai(df / 2, 0.5, df / (df + t * t))
    return 1 - tail if t > 0 else tail


def t95(df):
    low, high = 0.0, 100.0
    for _ in range(200):
        middle = (low + high) / 2
        if t_cdf(middle, df) < 0.975:
            low = middle
        else:
            high = middle
    return (low + high) / 2


def wilson(count, of):
    if of == 0:
        return [0.0, 1.0]
    p = count / of
    z2 = Z95 * Z95
    scale = 1 + z2 / of
    centre = (p + z2 / (2 * of)) / scale
    half = Z95 * math.sqrt(p * (1 - p) / of + z2 / (4 * of * of)) / scale
    return [max(0.0, centre - half), min(1.0, centre + half)]


def summary(values):
    n = len(values)
    mean = sum(values) / n
    sd = math.sqrt(sum((x - mean) ** 2 for x in values) / (n - 1))
    half = t95(n - 1) * sd / math.sqrt(n)
    ranked = sorted(values)
    rank = lambda percent: ranked[max(1, math.ceil(percent * n / 100)) - 1]
    return {"mean": mean, "sd": sd, "low": mean - half, "high": mean + half, "p10": rank(10), "p50": rank(50), "p90": rank(90)}


print(
    json.dumps(
        {
            "t95": {str(df): t95(df) for df in list(range(1, 41)) + [60, 100, 249, 1000, 100000]},
            "wilson": {f"{k}/{n}": wilson(k, n) for k, n in [(34, 1000), (0, 20), (20, 20), (7, 10), (1, 1), (512, 1000)]},
            "small": summary([9, 2, 4, 5, 4, 7, 4, 5]),
            "spread": summary([((i * 37) % 101) / 4 for i in range(250)]),
        },
        indent=2,
    )
)
