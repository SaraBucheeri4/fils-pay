package settlement

import (
	"fmt"
	"github.com/filspay/settlement/internal/money"
	"math/big"
)

func addFinancialFils(a, b money.Fils) (money.Fils, error) {
	n := new(big.Int).Add(big.NewInt(int64(a)), big.NewInt(int64(b)))
	if !n.IsInt64() {
		return 0, fmt.Errorf("financial total exceeds int64 fils")
	}
	return money.Fils(n.Int64()), nil
}

func subtractFinancialFils(a, b money.Fils) (money.Fils, error) {
	n := new(big.Int).Sub(big.NewInt(int64(a)), big.NewInt(int64(b)))
	if !n.IsInt64() {
		return 0, fmt.Errorf("financial total exceeds int64 fils")
	}
	return money.Fils(n.Int64()), nil
}
