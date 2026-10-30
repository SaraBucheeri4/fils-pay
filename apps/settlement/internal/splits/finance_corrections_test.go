package splits

import "testing"

func TestFinanceSharesConserveParent(t *testing.T) {
	shares := ChildShares(1, []ChildWeight{{5000}, {5000}})
	if shares[0]+shares[1] != 1 {
		t.Fatalf("shares=%v", shares)
	}
}
