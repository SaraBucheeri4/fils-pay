package splits

import (
	"github.com/filspay/settlement/internal/money"
	"math/big"
	"sort"
)

type ChildWeight struct{ WeightBps int64 }

// ChildShares allocates integer floors, then remaining fils to the largest
// fractional shares. Stable input order (child UUID at the caller) breaks ties.
func ChildShares(netPayout money.Fils, children []ChildWeight) []money.Fils {
	if netPayout < 0 {
		panic("negative split payout")
	}
	out := make([]money.Fils, len(children))
	total := new(big.Int)
	for _, c := range children {
		if c.WeightBps < 0 {
			panic("negative split weight")
		}
		total.Add(total, big.NewInt(c.WeightBps))
	}
	if total.Sign() == 0 {
		return out
	}
	type remainder struct {
		index  int
		amount *big.Int
	}
	remainders := make([]remainder, len(children))
	var allocated money.Fils
	for i, c := range children {
		n := new(big.Int).Mul(big.NewInt(int64(netPayout)), big.NewInt(c.WeightBps))
		quotient, rem := new(big.Int), new(big.Int)
		quotient.QuoRem(n, total, rem)
		out[i] = money.Fils(quotient.Int64())
		allocated += out[i]
		remainders[i] = remainder{i, rem}
	}
	sort.SliceStable(remainders, func(i, j int) bool { return remainders[i].amount.Cmp(remainders[j].amount) > 0 })
	for i := money.Fils(0); i < netPayout-allocated; i++ {
		out[remainders[int(i)].index]++
	}
	return out
}
