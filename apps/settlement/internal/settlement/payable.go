package settlement

import "github.com/filspay/settlement/internal/money"

// NetPayableFils preserves every fil of the frozen totals.
func NetPayableFils(grossFils, feeFils money.Fils) money.Fils {
	return grossFils - feeFils
}
